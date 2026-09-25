/**
 * Browser-face route gate: an app-owned route reachable from browser code is
 * document-relative. A root-absolute (`/api/x`), protocol-relative
 * (`//host/api/x`) or absolute (`https://host/api/x`) app route used to
 * address a resource binds the bundle to one mount, and a relative app route
 * resolved against a `location` read rebuilds the base the served document
 * already provides. A request target is the first argument of a request
 * constructor, of a `fetch`/`fetcher` callee, or of a dynamic import; an
 * assigned resource property (`script.src = ...`); or a JSX `src`/`href`
 * attribute. A target or a URL base reached through a local binding or a local
 * function is followed to the expressions it can evaluate to, so
 * `fetch(endpointFor(mode))` is governed as the route that function returns.
 *
 * Route keys stay absolute pathnames — the RPC channel key, the path a route is
 * registered under, and the shared `*_PATH`/`*_ENDPOINT` constants carrying
 * them — so a literal that is not a request target is out of scope. A browser
 * half addresses such a key by composing the derived `*_ROUTE`; substituting
 * the registration key into a template literal — the form a browser address is
 * built in — is refused as well, which the shared-key rule below requires.
 *
 * The static producers of browser references are checked in the same pass: a
 * field the browser resolves against its document (`url`, `src`, `href`)
 * must not be stamped with a root-absolute app route. Internal route keys and
 * response-table keys stay absolute and are not references. This rule reads
 * inline literal fragments only, so a composed reference
 * (`comboReference(...)`, `artifact.url.slice(1)`) is not traced:
 * `packages/client/modules/tests/node-half.client.spec.ts` owns the regression
 * signal for composed graph rows, batch descriptors, and the source-map trailer.
 *
 * Rationale: .agents/notes/implemented/architecture/2026-09-14-web-document-relative-app-routes.md.
 */

import { existsSync, globSync, readFileSync } from 'node:fs'
import { dirname, relative, resolve, sep } from 'node:path'
import ts from 'typescript'
import { faceConfigs } from './ts-project.ts'

const root = resolve(import.meta.dirname, '..')
const GATE = 'verify-client-route-resolution'
/** App-owned route prefixes; a foreign path (`/assets/x`) is not governed here. */
const APP_ROUTE_PREFIX = '(?:api|plugins|open-in-app)(?:/|$)'
/** A root-absolute or protocol-relative app route literal. */
const ROOT_ABSOLUTE_ROUTE = new RegExp(`^/{1,2}${APP_ROUTE_PREFIX}`)
/** An absolute or protocol-relative app route literal on any origin or scheme. */
const ABSOLUTE_ROUTE = new RegExp(`^(?:[A-Za-z][A-Za-z\\d+.-]*:)?//[^/]+/${APP_ROUTE_PREFIX}`)
/** A relative app route reference (`api/x`, `./plugins/x`). */
const RELATIVE_APP_ROUTE = new RegExp(`^(?:\\./)*${APP_ROUTE_PREFIX}`)
/** A shared host route key: the absolute pathname a route is registered under. */
const HOST_ROUTE_KEY = /(?:^|_)(?:PATH|ENDPOINT)$/

/** A route key a browser address may carry: a registration key or its derived browser form. */
const ADDRESSED_ROUTE_KEY = /(?:^|_)(?:ROUTE|PATH|ENDPOINT)$/

/** How many local bindings the gate follows before it stops tracing a value. */
const LOCAL_TRACE_DEPTH = 4

/** Request constructors whose first argument addresses a resource. */
const REQUEST_CONSTRUCTORS: Record<string, true> = { Request: true, EventSource: true, WebSocket: true, URL: true }
/** Assigned properties and JSX attributes that address a resource. */
const REQUEST_PROPERTIES: Record<string, true> = { href: true, src: true }
/** Fields a browser resolves against its own document. */
const REFERENCE_FIELDS: Record<string, true> = { url: true, src: true, href: true, initialUrl: true }

/**
 * Static producer of browser references: the node half composes the boot graph
 * the browser resolves against its document. No request-target position in
 * browser code sees those values, so its reference fields are checked directly.
 */
const REFERENCE_PRODUCERS = [
  'packages/client/modules/src/index.ts',
]

/** Rule that produced a violation, for diagnostics and for the gate's own coverage. */
export type RouteResolutionRule = 'request-target' | 'location-base' | 'host-route-key' | 'reference-producer'

/** What a scanned file is: browser face, or a static producer of browser references. */
export type RouteGateFace = 'browser' | 'reference-producer'

const HINT: Record<RouteResolutionRule, string> = {
  'request-target': 'write the route document-relative (api/x)',
  'location-base': 'resolve the route against document.baseURI, not against a location read',
  'host-route-key': 'strip the leading slash before the browser uses this key (KEY.slice(1))',
  'reference-producer': 'emit the browser reference document-relative (plugins/x)',
}

/** One app-owned route reached from a place that binds it to one mount. */
export interface RouteResolutionViolation {
  /** One-based source column. */
  column: number
  /** Repository-relative source path. */
  file: string
  /** One-based source line. */
  line: number
  /** The offending expression, as written. */
  pattern: string
  /** Rule that recognized the route. */
  rule: RouteResolutionRule
}

/**
 * Whether an expression reads the page location anywhere inside it: the global
 * `location` itself, or a property naming it behind any receiver. Local
 * bindings and local calls are followed, so a helper that returns a location
 * read is a location read.
 * @param node - expression to inspect.
 * @param locals - local values of the containing file.
 * @param depth - local bindings already followed.
 * @returns whether a location read is reachable.
 */
function readsLocation(node: ts.Node, locals: Map<string, ts.Expression[]>, depth = 0): boolean {
  if (ts.isIdentifier(node) && node.text === 'location') return true
  if (ts.isPropertyAccessExpression(node) && node.name.text === 'location') return true
  if (depth < LOCAL_TRACE_DEPTH && ts.isExpression(node)) {
    const name = referencedName(node)
    const local = name === undefined ? undefined : locals.get(name)
    if (local !== undefined) return local.some(value => readsLocation(value, locals, depth + 1))
  }
  let found = false
  node.forEachChild((child) => { found ||= readsLocation(child, locals, depth) })
  return found
}

/** Whether a route key is the receiver of the `slice` call that derives its browser form. */
function isDerivedKey(node: ts.Identifier): boolean {
  return ts.isPropertyAccessExpression(node.parent) && node.parent.name.text === 'slice'
}

/** Host route keys an expression references without stripping their leading slash. */
function unstrippedHostRouteKeys(node: ts.Node): ts.Identifier[] {
  if (ts.isIdentifier(node)) {
    if (!HOST_ROUTE_KEY.test(node.text) || isDerivedKey(node)) return []
    return [node]
  }
  const keys: ts.Identifier[] = []
  node.forEachChild((child) => { keys.push(...unstrippedHostRouteKeys(child)) })
  return keys
}

/**
 * Parse one source file with the kind its extension selects.
 * @param file - repository-relative path, which selects the JSX dialect.
 * @param sourceText - TypeScript or TSX source.
 * @returns the parsed source file.
 */
function parseSource(file: string, sourceText: string): ts.SourceFile {
  return ts.createSourceFile(
    file,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
}

/** Name of a local binding, or of a call to one; undefined for anything else. */
function referencedName(node: ts.Expression): string | undefined {
  if (ts.isIdentifier(node)) return node.text
  if (ts.isParenthesizedExpression(node)) return referencedName(node.expression)
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) return node.expression.text
  return undefined
}

/** Expressions one local name can evaluate to: its initializer and any value it returns. */
function localValues(source: ts.SourceFile): Map<string, ts.Expression[]> {
  const values = new Map<string, ts.Expression[]>()
  const add = (name: string, ...expressions: readonly ts.Expression[]): void => {
    const known = values.get(name)
    if (known === undefined) values.set(name, [...expressions])
    else known.push(...expressions)
  }
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer !== undefined) {
      add(node.name.text, node.initializer)
      const body = callableBody(node.initializer)
      if (body !== undefined) add(node.name.text, ...returnedExpressions(body))
    } else if (ts.isFunctionDeclaration(node) && node.name !== undefined && node.body !== undefined) {
      add(node.name.text, ...returnedExpressions(node.body))
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return values
}

/** Body of a function literal, when the expression is one. */
function callableBody(node: ts.Expression): ts.ConciseBody | undefined {
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return node.body
  return undefined
}

/** Expressions a function body returns, without descending into nested functions. */
function returnedExpressions(body: ts.ConciseBody): ts.Expression[] {
  if (!ts.isBlock(body)) return [body]
  const returns: ts.Expression[] = []
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionLike(node)) return
    if (ts.isReturnStatement(node)) {
      if (node.expression !== undefined) returns.push(node.expression)
      return
    }
    node.forEachChild(visit)
  }
  for (const statement of body.statements) visit(statement)
  return returns
}

/** Leaf expressions a value can evaluate to, following local bindings and local calls. */
function expandValue(node: ts.Expression, locals: Map<string, ts.Expression[]>, depth = 0): ts.Expression[] {
  if (depth >= LOCAL_TRACE_DEPTH) return [node]
  const name = referencedName(node)
  const local = name === undefined ? undefined : locals.get(name)
  if (local === undefined) return [node]
  return local.flatMap(value => expandValue(value, locals, depth + 1))
}

/** Whether one expression composes a root-absolute app route. */
function isAppRouteValue(node: ts.Expression): boolean {
  return literalFragments(node).some(
    fragment => ROOT_ABSOLUTE_ROUTE.test(fragment.text) || ABSOLUTE_ROUTE.test(fragment.text),
  )
}

/**
 * Which shared route keys the corpus declares. A key declared over a
 * root-absolute app route is app-owned; a key declared over anything else is
 * not, whatever a template does with it. A key the corpus never declares lives
 * in a host module outside the scanned faces and stays app-owned by convention.
 */
export interface RouteKeyIndex {
  /** Keys with at least one corpus declaration over an app-owned absolute path. */
  readonly appRoutes: ReadonlySet<string>
  /** Keys the corpus declares, all over values that are not app-owned absolute paths. */
  readonly otherKeys: ReadonlySet<string>
}

/** Index used when a caller analyzes one source without a scanned corpus. */
const EMPTY_ROUTE_KEY_INDEX: RouteKeyIndex = { appRoutes: new Set(), otherKeys: new Set() }

/** Whether a route key addresses an app-owned absolute path. */
function isAppRouteKey(
  name: string,
  locals: Map<string, ts.Expression[]>,
  index: RouteKeyIndex,
): boolean {
  const local = locals.get(name)
  if (local !== undefined) return local.some(isAppRouteValue)
  return index.appRoutes.has(name) || !index.otherKeys.has(name)
}

/** Registration keys a browser composes into a template literal, which is where an address is built. */
function templateRouteKeys(
  node: ts.Node,
  locals: Map<string, ts.Expression[]>,
  index: RouteKeyIndex,
): ts.Identifier[] {
  const keys: ts.Identifier[] = []
  const collect = (expression: ts.Node): void => {
    if (ts.isIdentifier(expression)) {
      if (HOST_ROUTE_KEY.test(expression.text) && !isDerivedKey(expression)
        && isAppRouteKey(expression.text, locals, index)) keys.push(expression)
      return
    }
    expression.forEachChild(collect)
  }
  const visit = (current: ts.Node): void => {
    if (ts.isTemplateExpression(current)) for (const span of current.templateSpans) collect(span.expression)
    current.forEachChild(visit)
  }
  visit(node)
  return keys
}

/**
 * Collect the route-key index of one scanned corpus.
 * @param sources - repository-relative path and text of every browser source.
 * @returns the declared app-owned keys and the keys declared over anything else.
 */
export function routeKeyIndex(sources: Iterable<readonly [string, string]>): RouteKeyIndex {
  const appRoutes = new Set<string>()
  const otherKeys = new Set<string>()
  for (const [file, sourceText] of sources) {
    const source = parseSource(file, sourceText)
    const record = (name: string, value: ts.Expression): void => {
      if (isAppRouteValue(value)) appRoutes.add(name)
      else otherKeys.add(name)
    }
    const visit = (node: ts.Node): void => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)
        && node.initializer !== undefined && HOST_ROUTE_KEY.test(node.name.text)) {
        record(node.name.text, node.initializer)
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  for (const name of appRoutes) otherKeys.delete(name)
  return { appRoutes, otherKeys }
}

/** Callee name of a call or construction, for constructors and `fetch`-shaped carriers. */
function calleeName(expression: ts.Expression): string | undefined {
  if (ts.isIdentifier(expression)) return expression.text
  return ts.isPropertyAccessExpression(expression) ? expression.name.text : undefined
}

/**
 * The request target one node carries, when it addresses a resource.
 * @param node - any node visited in the tree.
 * @returns the target expression, or undefined when the node is not a target.
 */
function requestTargetOf(node: ts.Node): ts.Expression | undefined {
  if (ts.isCallExpression(node)) {
    const name = calleeName(node.expression)
    if ((name !== undefined && /fetch(er)?$/iu.test(name)) || node.expression.kind === ts.SyntaxKind.ImportKeyword) return node.arguments[0]
    return undefined
  }
  if (ts.isNewExpression(node)) {
    const name = calleeName(node.expression)
    return name !== undefined && REQUEST_CONSTRUCTORS[name] === true ? node.arguments?.[0] : undefined
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
    && ts.isPropertyAccessExpression(node.left) && REQUEST_PROPERTIES[node.left.name.text] === true) {
    return node.right
  }
  if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name) && REQUEST_PROPERTIES[node.name.text] === true) {
    const { initializer } = node
    if (initializer === undefined) return undefined
    return ts.isJsxExpression(initializer) ? initializer.expression : initializer
  }
  return undefined
}

/** One literal fragment of a composed value, with the node that carries it. */
interface LiteralFragment { node: ts.Node; text: string }

/**
 * Literal fragments of a value composed of literals, `+` concatenation,
 * templates, and conditionals. Template fragments are the spans between
 * substitutions, so an interpolated prefix (`${origin}/api/x`) is visible.
 * @param node - the expression to decompose.
 * @returns fragments in source order.
 */
function literalFragments(node: ts.Expression): LiteralFragment[] {
  if (ts.isParenthesizedExpression(node)) return literalFragments(node.expression)
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    return [...literalFragments(node.left), ...literalFragments(node.right)]
  }
  if (ts.isConditionalExpression(node)) {
    return [...literalFragments(node.whenTrue), ...literalFragments(node.whenFalse)]
  }
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [{ node, text: node.text }]
  if (ts.isTemplateExpression(node)) {
    // Every fragment reports the template itself: an interpolated prefix makes
    // the offending span start mid-expression, and one template is one route.
    return [
      { node, text: node.head.text },
      ...node.templateSpans.map(span => ({ node, text: span.literal.text })),
    ]
  }
  return []
}

/**
 * Find app-owned routes that bind one source file to one mount.
 * @param file - repository-relative path used in diagnostics.
 * @param sourceText - TypeScript or TSX source.
 * @param face - `browser` for request targets, `reference-producer` for the
 * fields a static host emits into the browser.
 * @param index - route keys the scanned corpus declares; a key outside it is
 * app-owned by convention.
 * @returns violations in source order.
 */
export function findRouteResolutionViolations(
  file: string,
  sourceText: string,
  face: RouteGateFace = 'browser',
  index: RouteKeyIndex = EMPTY_ROUTE_KEY_INDEX,
): RouteResolutionViolation[] {
  const source = parseSource(file, sourceText)
  const violations = new Map<number, RouteResolutionViolation>()
  const locals = localValues(source)

  const report = (node: ts.Node, rule: RouteResolutionRule): void => {
    const start = node.getStart(source)
    if (violations.has(start)) return
    const { character, line } = source.getLineAndCharacterOfPosition(start)
    violations.set(start, { column: character + 1, file, line: line + 1, pattern: node.getText(source), rule })
  }

  const isRootAbsolute = (text: string): boolean => ROOT_ABSOLUTE_ROUTE.test(text) || ABSOLUTE_ROUTE.test(text)

  /** A request target's own literals must be document-relative, including the values it resolves to. */
  const checkTarget = (target: ts.Expression): void => {
    for (const value of expandValue(target, locals)) {
      for (const fragment of literalFragments(value)) {
        // A value the target only resolves to is reported at the target, which is
        // where the browser builds the address.
        if (isRootAbsolute(fragment.text)) report(value === target ? fragment.node : target, 'request-target')
      }
    }
    // A shared route key used as-is: the browser half strips the leading slash.
    for (const key of unstrippedHostRouteKeys(target)) report(key, 'host-route-key')
  }

  /** Whether a URL operand carries an app route: an inline route literal or a route key. */
  const carriesAppRoute = (operand: ts.Expression): boolean => {
    if (ts.isIdentifier(operand) && ADDRESSED_ROUTE_KEY.test(operand.text)) return true
    return expandValue(operand, locals).some(value =>
      literalFragments(value).some(fragment => RELATIVE_APP_ROUTE.test(fragment.text)))
  }

  /** A relative app route belongs to the document base, not to a rebuilt origin. */
  const checkUrlBase = (node: ts.NewExpression): void => {
    const [first, second] = node.arguments ?? []
    if (first === undefined || second === undefined) return
    if (!readsLocation(second, locals)) return
    if (carriesAppRoute(first)) report(first, 'location-base')
  }

  /** A field the browser resolves against its document carries a reference. */
  const checkReferenceField = (value: ts.Expression): void => {
    for (const fragment of literalFragments(value)) {
      if (ROOT_ABSOLUTE_ROUTE.test(fragment.text) || ABSOLUTE_ROUTE.test(fragment.text)) {
        report(fragment.node, 'reference-producer')
      }
    }
  }

  const visit = (node: ts.Node): void => {
    if (face === 'browser') {
      const target = requestTargetOf(node)
      if (target !== undefined) checkTarget(target)
      if (ts.isNewExpression(node) && calleeName(node.expression) === 'URL') checkUrlBase(node)
    } else if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name)
      && REFERENCE_FIELDS[node.name.text] === true && ts.isExpression(node.initializer)) {
      checkReferenceField(node.initializer)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  if (face === 'browser') {
    for (const key of templateRouteKeys(source, locals, index)) report(key, 'host-route-key')
  }

  return [...violations.values()].sort((left, right) => left.line - right.line || left.column - right.column)
}

/**
 * Source files of every browser-side TypeScript project in the Client aggregate.
 *
 * A browser half belongs to `src/client`; a package that keeps its whole UI in
 * plain `src` is found through the project itself, which carries the Client
 * compiler shape (DOM libraries). A config the Host aggregate also compiles has
 * a host half rather than a browser-only surface, so its plain `src/` is
 * scanned only when it has no `src/client` half; that half arrives below. Every
 * such face must contribute at least one source file: a face that contributes
 * none means the aggregate's layout moved out from under this discovery, which
 * must fail loud rather than scan less.
 * @param projectRoot - repository root to discover from.
 * @returns sorted repository-relative source paths.
 */
export function browserFaceSources(projectRoot: string = root): string[] {
  const sources = new Set<string>()
  const add = (file: string): void => {
    const normalized = file.replaceAll('\\', '/')
    if (normalized.endsWith('.d.ts')) return
    sources.add(normalized)
  }
  const hostConfigs = faceConfigs(projectRoot, 'host').byPath

  for (const [configPath, parsed] of faceConfigs(projectRoot, 'client').byPath) {
    if (parsed.options.lib?.includes('lib.dom.d.ts') !== true) continue
    const configRoot = dirname(configPath).replaceAll('\\', '/')
    const sourceRoot = `${configRoot}/src/`
    // An aggregate or app shell (the root Client program) carries the compiler
    // shape but no `src/` tree of its own; its browser sources arrive through
    // the references and `src/client` discovery below.
    if (!existsSync(sourceRoot)) continue
    // A package the Host aggregate also compiles has a host half; when its
    // browser half is `src/client`, plain `src/` may hold the node half, and
    // `src/client` alone is scanned below. Without that half, all of `src/` is
    // the browser surface.
    if (hostConfigs.has(configPath) && existsSync(`${configRoot}/src/client`)) continue
    const faceSources = parsed.fileNames.filter((file) => {
      const normalized = file.replaceAll('\\', '/')
      return normalized.startsWith(sourceRoot) && /\.tsx?$/.test(normalized)
    })
    if (faceSources.length === 0) {
      throw new Error(
        `${GATE}: browser face ${relative(projectRoot, configPath).split(sep).join('/')} has DOM libraries but contributes no source file; discovery is broken.`,
      )
    }
    for (const file of faceSources) add(relative(projectRoot, file).split(sep).join('/'))
  }

  for (const file of globSync('packages/*/*/src/client/**/*.{ts,tsx}', { cwd: projectRoot })) {
    add(relative(projectRoot, resolve(projectRoot, file)).split(sep).join('/'))
  }

  return [...sources].sort()
}

/** Scan one file for one face; a producer that disappeared must fail loud. */
function scan(file: string, face: RouteGateFace): RouteResolutionViolation[] {
  const path = resolve(root, file)
  if (face === 'reference-producer' && !existsSync(path)) {
    throw new Error(`${GATE}: browser-reference producer ${file} is gone; discovery is broken.`)
  }
  return findRouteResolutionViolations(file, readFileSync(path, 'utf8'), face)
}

function main(): void {
  const files = browserFaceSources()
  if (files.length === 0) throw new Error(`${GATE}: the Client aggregate contributed no browser source; discovery is broken.`)
  const sources = files.map(file => [file, readFileSync(resolve(root, file), 'utf8')] as const)
  const index = routeKeyIndex(sources)
  const violations = [
    ...sources.flatMap(([file, sourceText]) => findRouteResolutionViolations(file, sourceText, 'browser', index)),
    ...REFERENCE_PRODUCERS.flatMap(file => scan(file, 'reference-producer')),
  ]
  if (violations.length > 0) {
    console.error(`${GATE}: ${violations.length} app-owned route(s) that are not document-relative:`)
    for (const violation of violations) {
      console.error(
        `  ${violation.file}:${violation.line}:${violation.column} ${violation.pattern} — ${HINT[violation.rule]}`,
      )
    }
    process.exitCode = 1
    return
  }
  console.log(
    `${GATE}: ${files.length} browser source file(s) and ${REFERENCE_PRODUCERS.length} browser-reference producer(s) keep app-owned routes document-relative.`,
  )
}

if (import.meta.filename === resolve(process.argv[1] ?? '')) main()
