/**
 * Verify the registry resolves every `@qilin-agent` range the just-published
 * family declares, as consumers — not the publish order — see it.
 *
 * The publish order guarantees a family publishes its install dependencies
 * first, but the vendored framework is a separate release sequence whose
 * packages appear only in dependency and peer ranges, and npm 7+ installs
 * peers on the consumer's behalf instead of warning about them. A qilin
 * release that ships while its members point at vendor versions the registry
 * lacks is therefore uninstallable, which the 3.1.7 release demonstrated:
 * every member declared `@qilin-agent/kylin: ~4.0.5` and friends while the
 * registry still carried 4.0.3
 * ([rationale](../../.agents/notes/implemented/process/2026-10-25-npm-release-vendor-resolution-gate.md)).
 * This gate reads the registry after publication and fails the run when any
 * declared range has no satisfying version.
 *
 * Registry reads use `--prefer-online` because a checkout's npm cache can
 * serve the packument from before the publish this gate verifies
 * ([ground-truth rule](../../.agents/notes/implemented/process/2026-10-12-publish-resume-after-interruption.md)).
 * @module verify-published
 */

import { maxSatisfying } from 'semver'
import { parseArgs } from 'node:util'
import { releaseFamily } from './families.ts'
import { attempt, isEntry } from './process.ts'
import { PUBLISH_ORDER_FILE, packedIdentity, readPublishOrder, type PackedIdentity } from './tarball.ts'

/** Dependency sections consumers resolve, in report order. */
const RESOLVED_SECTIONS = ['dependencies', 'optionalDependencies', 'peerDependencies'] as const

/** One section name from {@link RESOLVED_SECTIONS}. */
export type ResolvedSection = (typeof RESOLVED_SECTIONS)[number]

/** The dependency and peer sections of one published package version. */
export interface PublishedSections {
  readonly dependencies?: Readonly<Record<string, string>> | undefined
  readonly optionalDependencies?: Readonly<Record<string, string>> | undefined
  readonly peerDependencies?: Readonly<Record<string, string>> | undefined
  /** Optional peers are advisory for npm, so their ranges need not resolve. */
  readonly peerDependenciesMeta?: Readonly<Record<string, { optional?: boolean }>> | undefined
}

/** One member of the packed set this gate verifies, as published. */
export type PublishedMember = PackedIdentity

/** Registry facts the verification reads; tests substitute a fake. */
export interface RegistrySnapshot {
  /**
   * Every published version of one package.
   * @param name - package name.
   * @returns The version list, or undefined when the registry lacks the package.
   */
  versions(name: string): Promise<readonly string[] | undefined>

  /**
   * The consumer-visible dependency and peer sections of one published version.
   * @param name - package name.
   * @param version - package version.
   * @returns The sections, or undefined when the registry lacks that version.
   */
  sections(name: string, version: string): Promise<PublishedSections | undefined>
}

/** One declared range the registry cannot satisfy. */
export interface UnresolvedRange {
  /** The published member that declares the range, as `name@version`. */
  readonly consumer: string
  /** Which section declares it. */
  readonly section: ResolvedSection
  /** The `@qilin-agent` package the range names. */
  readonly dependency: string
  /** The declared range. */
  readonly range: string
}

/** What the verification found across the whole packed set. */
export interface PublishedResolutionReport {
  /** Members whose own published version the registry already carries. */
  readonly checked: number
  /** Members absent from the registry: an interrupted publish left a hole. */
  readonly missingMembers: readonly string[]
  /** Declared `@qilin-agent` ranges with no satisfying registry version. */
  readonly unresolved: readonly UnresolvedRange[]
}

/** The `@qilin-agent` scope this repository publishes. */
const SCOPE = '@qilin-agent/'

/**
 * Read one JSON body npm printed, tolerating npm's "empty field prints nothing" behaviour.
 * @param stdout - captured npm output.
 * @param context - what was fetched, for the error message.
 * @returns The parsed JSON, or undefined for empty output.
 */
function parseNpmJson(stdout: string, context: string): unknown {
  const trimmed = stdout.trim()
  if (trimmed === '') return undefined
  try {
    const parsed: unknown = JSON.parse(trimmed)
    return parsed
  } catch (error) {
    throw new Error(`registry returned unparsable JSON for ${context}: ${String(error)}`)
  }
}

/**
 * Read a string-keyed object out of one npm-view field.
 * @param value - the field value npm printed.
 * @param context - what was fetched, for the error message.
 * @returns The entries, or undefined when the field is absent or empty.
 */
function readSectionTable(value: unknown, context: string): Readonly<Record<string, string>> | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const parsed = typeof value === 'string' ? parseNpmJson(value, context) : value
  if (parsed === undefined || parsed === null) return undefined
  if (typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`${context} is not a dependency table`)
  return parsed as Readonly<Record<string, string>>
}

/** npm-backed {@link RegistrySnapshot}; one shell call per fact, cached per package. */
class NpmRegistrySnapshot implements RegistrySnapshot {
  private readonly versionCache = new Map<string, Promise<readonly string[] | undefined>>()
  private readonly sectionCache = new Map<string, Promise<PublishedSections | undefined>>()

  /**
   * @param registry - registry origin every read targets.
   * @param environment - extra environment for the npm child (proxy settings ride along).
   */
  constructor(
    private readonly registry: string,
    private readonly environment: NodeJS.ProcessEnv = process.env,
  ) {}

  async versions(name: string): Promise<readonly string[] | undefined> {
    const cached = this.versionCache.get(name)
    if (cached !== undefined) return cached
    const pending = this.readVersions(name)
    this.versionCache.set(name, pending)
    return pending
  }

  async sections(name: string, version: string): Promise<PublishedSections | undefined> {
    const key = `${name}@${version}`
    const cached = this.sectionCache.get(key)
    if (cached !== undefined) return cached
    const pending = this.readSections(name, version)
    this.sectionCache.set(key, pending)
    return pending
  }

  private async readVersions(name: string): Promise<readonly string[] | undefined> {
    const result = attemptNpmView([name, 'versions', '--json'], this.registry, this.environment)
    if (isRegistryMiss(result)) return undefined
    if (result.status !== 0) throw new Error(`npm view ${name} versions failed: ${result.stderr.trim()}`)
    const parsed = parseNpmJson(result.stdout, `${name} versions`)
    // npm collapses a one-version list to a bare string.
    if (typeof parsed === 'string') return [parsed]
    if (!Array.isArray(parsed) || parsed.some(entry => typeof entry !== 'string')) {
      throw new Error(`${name} versions is not a version list`)
    }
    return parsed as readonly string[]
  }

  private async readSections(name: string, version: string): Promise<PublishedSections | undefined> {
    const spec = `${name}@${version}`
    const result = attemptNpmView(
      [spec, ...RESOLVED_SECTIONS, 'peerDependenciesMeta', '--json'],
      this.registry,
      this.environment,
    )
    if (isRegistryMiss(result)) return undefined
    if (result.status !== 0) throw new Error(`npm view ${spec} sections failed: ${result.stderr.trim()}`)
    // A version that exists but declares none of the sections prints nothing:
    // that is a present member with no dependencies, not a registry miss.
    if (result.stdout.trim() === '') return {}
    const parsed = parseNpmJson(result.stdout, `${spec} sections`)
    if (parsed === undefined) return {}
    if (typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`${spec} sections is not an object`)
    const table = parsed as Record<string, unknown>
    const section = (field: string): Readonly<Record<string, string>> | undefined =>
      readSectionTable(table[field], `${spec} ${field}`)
    const meta = readSectionTable(table.peerDependenciesMeta, `${spec} peerDependenciesMeta`)
    return {
      dependencies: section('dependencies'),
      optionalDependencies: section('optionalDependencies'),
      peerDependencies: section('peerDependencies'),
      peerDependenciesMeta: meta as PublishedSections['peerDependenciesMeta'],
    }
  }
}

/**
 * Run one `npm view` against the target registry, bypassing the local packument cache.
 * @param args - npm-view arguments after the spec.
 * @param registry - registry origin to read.
 * @param environment - environment for the npm child.
 * @returns The captured result, unjudged: an E404 is data here, not a failure.
 */
function attemptNpmView(
  args: readonly string[],
  registry: string,
  environment: NodeJS.ProcessEnv,
): { status: number | null; stdout: string; stderr: string } {
  return attempt('npm', ['view', ...args, '--prefer-online', `--registry=${registry}`], { env: environment })
}

/**
 * Whether npm answered that the package or version does not exist.
 * @param result - the captured npm result.
 * @returns True when the miss means "absent" rather than "broken".
 */
function isRegistryMiss(result: { status: number | null; stdout: string; stderr: string }): boolean {
  if (result.status === 0) return false
  return /E404|NOT_FOUND|404 Not Found/u.test(`${result.stdout}\n${result.stderr}`)
}

/**
 * The `@qilin-agent` ranges one published version requires consumers to resolve.
 *
 * Optional peers are skipped: npm installs peers by default since 7, but a peer
 * marked optional stays advisory, so an unresolvable one cannot break an install.
 * Optional dependencies stay required: this repository uses them for engines a
 * package advertises, and a silently skipped engine is a broken release even
 * though npm exits zero.
 * @param sections - the published sections.
 * @returns In-scope `[section, dependency, range]` triples, in report order.
 */
export function requiredRanges(sections: PublishedSections): readonly (readonly [
  section: ResolvedSection,
  dependency: string,
  range: string,
])[] {
  const triples: (readonly [ResolvedSection, string, string])[] = []
  for (const section of RESOLVED_SECTIONS) {
    const table = sections[section]
    if (table === undefined) continue
    for (const [dependency, range] of Object.entries(table)) {
      if (!dependency.startsWith(SCOPE)) continue
      if (
        section === 'peerDependencies'
        && sections.peerDependenciesMeta?.[dependency]?.optional === true
      ) continue
      triples.push([section, dependency, range] as const)
    }
  }
  return triples
}

/**
 * Verify every packed member exists on the registry and every in-scope range resolves.
 * @param members - the packed set, in publish order.
 * @param registry - the registry facts to check against.
 * @returns The report; any `missingMembers` or `unresolved` entry fails the release.
 */
export async function verifyPublishedResolution(
  members: readonly PublishedMember[],
  registry: RegistrySnapshot,
): Promise<PublishedResolutionReport> {
  const missingMembers: string[] = []
  const unresolved: UnresolvedRange[] = []
  let checked = 0

  for (const member of members) {
    const sections = await registry.sections(member.name, member.version)
    if (sections === undefined) {
      missingMembers.push(`${member.name}@${member.version}`)
      continue
    }
    checked += 1
    for (const [section, dependency, range] of requiredRanges(sections)) {
      const versions = await registry.versions(dependency)
      const satisfied = versions !== undefined && maxSatisfying([...versions], range) !== null
      if (!satisfied) unresolved.push({ consumer: `${member.name}@${member.version}`, section, dependency, range })
    }
  }
  return { checked, missingMembers, unresolved }
}

/**
 * Read the packed set a pack step produced, in upload order.
 * @param directory - pack output directory holding tarballs and the order file.
 * @returns Members in upload order.
 */
export function readPackedMembers(directory: string): readonly PublishedMember[] {
  return readPublishOrder(directory)
    .filter(name => name.endsWith('.tgz'))
    .map(name => packedIdentity(`${directory}/${name}`))
}

/**
 * Print the report and answer whether the release may stand.
 * @param report - what the verification found.
 * @returns True when the registry resolves the whole set.
 */
function report(report: PublishedResolutionReport): boolean {
  console.log(`release verify-published: ${String(report.checked)} member(s) present on the registry`)
  for (const member of report.missingMembers) {
    console.error(`release verify-published: MISSING ${member} — the publish run left a hole`)
  }
  for (const failure of report.unresolved) {
    console.error(
      `release verify-published: UNRESOLVED ${failure.consumer} ${failure.section}`
      + ` ${failure.dependency}@${failure.range} — no satisfying registry version;`
      + ' publish the referenced family or fix the range',
    )
  }
  if (report.missingMembers.length === 0 && report.unresolved.length === 0) {
    console.log('release verify-published: every declared @qilin-agent range resolves')
    return true
  }
  console.error(
    `release verify-published: ${String(report.missingMembers.length)} missing member(s),`
    + ` ${String(report.unresolved.length)} unresolved range(s)`,
  )
  return false
}

/** Command-line entry point. */
async function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      family: { type: 'string', default: 'qilin' },
      from: { type: 'string' },
      registry: { type: 'string', default: 'https://registry.npmjs.org/' },
    },
    strict: true,
  })
  if (values.from === undefined) throw new Error('verify-published requires --from <pack output directory>')
  const family = releaseFamily(values.family)
  const members = readPackedMembers(values.from)
  if (members.length === 0) throw new Error(`${values.from} carries no tarballs beside ${PUBLISH_ORDER_FILE}`)
  console.log(`release verify-published: family ${family.id}, ${String(members.length)} member(s) from ${values.from}`)
  const reportResult = await verifyPublishedResolution(members, new NpmRegistrySnapshot(values.registry))
  if (!report(reportResult)) process.exitCode = 1
}

if (isEntry(import.meta.url)) {
  try {
    await main()
  } catch (error: unknown) {
    console.error(`release verify-published: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}
