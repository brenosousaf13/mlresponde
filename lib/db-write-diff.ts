import { isDeepStrictEqual } from "node:util"

/** JSONB ignora a ordem das chaves; timestamptz pode voltar com outro formato/fuso. */
export function changedFields<T extends object>(current: object, next: T): Partial<T> {
  const changes: Partial<T> = {}
  for (const key of Object.keys(next) as (keyof T & string)[]) {
    const before = (current as Record<string, unknown>)[key]
    const after = next[key]
    if (key.endsWith("_at") && typeof before === "string" && typeof after === "string") {
      const time = Date.parse(before)
      if (Number.isFinite(time) && time === Date.parse(after)) continue
    }
    if (!isDeepStrictEqual(before, after)) changes[key] = after
  }
  return changes
}
