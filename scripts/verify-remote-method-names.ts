/**
 * Every `@Remote` method name a Host namespace ships must be free of the
 * namespace service's own surface: a descriptor whose name the service already
 * owns — a field, a getter, or a method such as `install` or `remove` — is
 * refused when the Client mounts it. Nothing type-checks that, and the failure
 * appears only at boot, so the Client entry stays PENDING and the namespace
 * never answers.
 *
 * The reserved surface is read from the mechanism's own source rather than
 * copied here, so this gate cannot drift from the rule it enforces.
 * @module verify-remote-method-names
 */
import { globSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ts from 'typescript'

const root = resolve(import.meta.dirname, '..')

/** The module that both defines the reservation and refuses a shadowing mount. */
const MECHANISM = 'packages/api/gateway/src/client/index.ts'

/** The namespace service class whose own surface a mounted method may not shadow. */
const MECHANISM_CLASS = 'RemoteNamespaceService'

/** The field-name set the same module reserves. */
const MECHANISM_FIELDS = 'REMOTE_NAMESPACE_FIELDS'

/** Sources that declare Host Remote methods. */
const SCAN_GLOBS = ['packages/*/*/src/**/*.ts']

/** One decorated method name and where it is declared. */
export interface RemoteMethodName {
  /** The method name as it reaches the wire. */
  readonly name: string
  /** Repository-relative source path. */
  readonly file: string
  /** 1-based line of the declaration. */
  readonly line: number
}

/** Whether a decorator node is `@Remote` or `@Remote(...)`. */
function isRemoteDecorator(node: ts.Decorator): boolean {
  const expression = node.expression
  if (ts.isIdentifier(expression)) return expression.text === 'Remote'
  if (ts.isCallExpression(expression) && ts.isIdentifier(expression.expression)) {
    return expression.expression.text === 'Remote'
  }
  return false
}

/** The declared name of one class member, when it has a plain identifier. */
function memberName(member: ts.ClassElement): string | undefined {
  const name = (member as ts.NamedDeclaration).name
  return name !== undefined && ts.isIdentifier(name) ? name.text : undefined
}

/** Every string element of a `new Set([...])` initializer. */
function setLiteralMembers(statement: ts.VariableStatement): string[] {
  const initializer = statement.declarationList.declarations[0]?.initializer
  if (initializer === undefined || !ts.isNewExpression(initializer)) return []
  const argument = initializer.arguments?.[0]
  if (argument === undefined || !ts.isArrayLiteralExpression(argument)) return []
  return argument.elements.flatMap(element => ts.isStringLiteral(element) ? [element.text] : [])
}

/**
 * The names the namespace service already owns: its own class members plus the
 * field set the same module reserves.
 * @param sourceText - the mechanism module's source.
 * @returns the reserved names.
 */
export function reservedRemoteMethodNames(sourceText: string): Set<string> {
  const source = ts.createSourceFile(MECHANISM, sourceText, ts.ScriptTarget.Latest, true)
  const reserved = new Set<string>()
  for (const statement of source.statements) {
    if (ts.isClassDeclaration(statement) && statement.name?.text === MECHANISM_CLASS) {
      for (const member of statement.members) {
        const name = memberName(member)
        if (name !== undefined) reserved.add(name)
      }
    }
    if (ts.isVariableStatement(statement)) {
      const declared = statement.declarationList.declarations[0]?.name
      if (declared !== undefined && ts.isIdentifier(declared) && declared.text === MECHANISM_FIELDS) {
        for (const name of setLiteralMembers(statement)) reserved.add(name)
      }
    }
  }
  reserved.delete('constructor')
  return reserved
}

/**
 * Every `@Remote`-decorated member name in one source.
 * @param file - repository-relative path, for the report.
 * @param sourceText - the source to read.
 * @returns the decorated names, in declaration order.
 */
export function collectRemoteMethodNames(file: string, sourceText: string): RemoteMethodName[] {
  const source = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true)
  const found: RemoteMethodName[] = []
  const visit = (node: ts.Node): void => {
    if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
      for (const member of node.members) {
        const decorators = ts.canHaveDecorators(member) ? ts.getDecorators(member) : undefined
        if (decorators?.some(isRemoteDecorator) !== true) continue
        const name = memberName(member)
        if (name === undefined) continue
        // The name node rather than the member: its start includes the decorators.
        const named = (member as ts.NamedDeclaration).name ?? member
        found.push({
          name,
          file,
          line: source.getLineAndCharacterOfPosition(named.getStart(source)).line + 1,
        })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return found
}

/** One shipped name that would be refused at mount time. */
export interface RemoteMethodViolation extends RemoteMethodName {
  /** The reserved member it shadows. */
  readonly reservedBy: string
}

/**
 * Read the reserved surface from the mechanism source.
 * @returns the reserved names, guaranteed non-empty.
 */
export function reservedFromMechanism(): Set<string> {
  const reserved = reservedRemoteMethodNames(readFileSync(resolve(root, MECHANISM), 'utf8'))
  // A narrowed extraction would pass every file below, so an empty or
  // implausibly small set is a gate defect rather than a clean repository.
  if (reserved.size < 5) {
    throw new Error(`verify-remote-method-names: read only ${String(reserved.size)} reserved name(s) from ${MECHANISM}.`)
  }
  return reserved
}

/**
 * Scan every Host Remote declaration against the reserved surface.
 * @param reserved - the reserved names.
 * @param files - repository-relative sources to scan.
 * @returns the shadowing names, in declaration order.
 */
export function findRemoteMethodViolations(
  reserved: ReadonlySet<string>,
  files: readonly string[],
): RemoteMethodViolation[] {
  return files
    .flatMap(file => collectRemoteMethodNames(file, readFileSync(resolve(root, file), 'utf8')))
    .flatMap(method => reserved.has(method.name) ? [{ ...method, reservedBy: method.name }] : [])
}

/** How many decorated declarations the scan must find before a clean result means anything. */
const MINIMUM_SCANNED = 50

/**
 * Scan the repository.
 * @returns the violations, and how many declarations were read.
 */
export function scanRepository(): { violations: RemoteMethodViolation[]; scanned: number } {
  const reserved = reservedFromMechanism()
  const files = SCAN_GLOBS.flatMap(pattern => globSync(pattern, { cwd: root })).sort()
  if (files.length === 0) {
    throw new Error('verify-remote-method-names: scanned an empty corpus; the globs no longer match.')
  }
  const violations = findRemoteMethodViolations(reserved, files)
  const scanned = files
    .flatMap(file => collectRemoteMethodNames(file, readFileSync(resolve(root, file), 'utf8')))
    .length
  if (scanned < MINIMUM_SCANNED) {
    throw new Error(`verify-remote-method-names: read only ${String(scanned)} Remote declaration(s); the decorator scan narrowed.`)
  }
  return { violations, scanned }
}

function main(): void {
  const { violations, scanned } = scanRepository()
  if (violations.length === 0) {
    console.log(`verify-remote-method-names: ${String(scanned)} Remote declaration(s) clear of the namespace service's own surface.`)
    return
  }
  console.error('verify-remote-method-names: a Remote method shadows its namespace service and will be refused at mount time.\n')
  for (const violation of violations) {
    console.error(`  ${violation.file}:${String(violation.line)} ${violation.name}`)
  }
  console.error('\nRename the operation around the reservation (for example `delete` for `remove`);')
  console.error('the refusal is in RemoteNamespaceService.assertMethodAvailable.')
  process.exit(1)
}

if (import.meta.filename === resolve(process.argv[1] ?? '')) main()
