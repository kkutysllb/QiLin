/** Synchronous schema introspection and immutable settings-draft edits. */
import { Service } from '@qilin-agent/kylin'
import type { Context } from '@qilin-agent/kylin'
import {
  deletePath as deleteDraftPath,
  getPath as getDraftPath,
  hasPath as hasDraftPath,
  nodeAtPath as nodeAtSchemaPath,
  rehydrateSchema,
  setPath as setDraftPath,
  validateDraft,
  type SchemaNode,
} from '@qilin-agent/client-schema-form'

export type { SchemaNode }

/**
 * Settings-owned synchronous schema service. Dynamic client plugins receive
 * this Cordis entity instead of importing executable helpers from one another;
 * it delegates to the shared schema/draft model layer so one implementation
 * backs both this service and the shipped editors that import it directly.
 */
export class SettingsSchemaService extends Service {
  /** @param ctx - providing ui-settings context. */
  constructor(ctx: Context) {
    super(ctx, 'settingsSchema')
  }

  /**
   * Rehydrate one serialized `schema.toJSON()` envelope.
   * @param serialized - serialized Schemastery node.
   * @returns live schema node.
   */
  rehydrate(serialized: unknown): SchemaNode {
    return rehydrateSchema(serialized)
  }

  /**
   * Validate a settings draft.
   * @param schema - live schema node.
   * @param draft - candidate settings value.
   * @returns validation failure text, or `undefined` when valid.
   */
  validate(schema: SchemaNode, draft: unknown): string | undefined {
    return validateDraft(schema, draft)
  }

  /**
   * Resolve an object, dict, or array schema node at a settings path.
   * @param root - schema node to traverse.
   * @param path - object keys or array indexes.
   * @returns the resolved node, or `undefined` when the path is absent.
   */
  nodeAtPath(root: SchemaNode, path: readonly string[]): SchemaNode | undefined {
    return nodeAtSchemaPath(root, path)
  }

  /**
   * Read a nested value by a string-key or array-index path.
   * @param value - value to traverse.
   * @param path - object keys or array indexes.
   * @returns the resolved value, or `undefined` when the path is absent.
   */
  getPath(value: unknown, path: readonly string[]): unknown {
    return getDraftPath(value, path)
  }

  /**
   * Report whether the final path key exists independently of its value.
   * @param value - value to traverse.
   * @param path - object keys or array indexes.
   * @returns whether the path exists.
   */
  hasPath(value: unknown, path: readonly string[]): boolean {
    return hasDraftPath(value, path)
  }

  /**
   * Immutably set a nested value, materializing missing containers.
   * @param root - settings object to copy.
   * @param path - non-empty object-key or array-index path.
   * @param value - replacement value.
   * @returns copied root containing the replacement.
   * @throws when `path` is empty.
   */
  setPath(root: Record<string, unknown>, path: readonly string[], value: unknown): Record<string, unknown> {
    return setDraftPath(root, path, value)
  }

  /**
   * Immutably remove a nested key, preserving an unchanged missing root.
   * @param root - settings object to copy.
   * @param path - non-empty object-key or array-index path.
   * @returns copied root without the key, or `root` when the path is absent.
   * @throws when `path` is empty.
   */
  deletePath(root: Record<string, unknown>, path: readonly string[]): Record<string, unknown> {
    return deleteDraftPath(root, path)
  }
}

declare module '@qilin-agent/kylin' {
  interface Context {
    /** Settings-owned synchronous schema and immutable path operations. */
    settingsSchema: SettingsSchemaService
  }
}
