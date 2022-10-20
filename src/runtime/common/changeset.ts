import _, { get, indexOf, isString, set, toInteger, toString } from "lodash";

import { Changeset, FieldDef } from "@src/types/definition";

export type ActionChangesetContext = {
  input: Record<string, unknown>;
};

/**
 * Build result record from given action changeset rules and give context (source) inputs.
 */
export function buildChangset(
  actionChangset: Changeset,
  context: ActionChangesetContext
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(actionChangset)
      .map(([name, setter]) => {
        // TODO: format values by type
        if (setter.kind === "value") {
          return [name, formatFieldValue(setter.value, setter.type)];
        } else if (setter.kind === "fieldset-input") {
          return [
            name,
            formatFieldValue(
              getFieldsetProperty(context.input, setter.fieldsetAccess),
              setter.type
            ),
          ];
        }

        return [];
      })
      // skip empty entries
      .filter((entry) => entry.length > 0)
  );
}

/**
 * Format unknown field value to one of mapping types.
 *
 * If `value` is `undefined`/`null`, an `undefined` is returned.
 *
 * This function uses `lodash` to convert "text" and "integer".
 * For details see: https://lodash.com/docs
 *
 * Mappings:
 * - text - `string`, `_.toString()`
 * - integer - `number`, `_.toInteger()`
 * - boolean - `boolean`, see below
 *
 * Due to `lodash` lacking boolean converter, this fn does it manually following these rules:
 * - "true" - string "true", case insensitive ("true", "TRUE", "TruE", ...)
 * - true - real boolean true
 * - everything else is converted to `false`
 *
 * TODO: move to some utils folder if it's ok
 */
export function formatFieldValue(
  value: unknown,
  type: FieldDef["type"]
): string | number | boolean | undefined {
  if (value == null) return;

  if (type === "boolean") {
    if (isString(value)) {
      value = value.toLowerCase();
    }

    return indexOf(["true", true], value) != -1;
  } else if (type === "integer") {
    return toInteger(value);
  } else {
    return toString(value);
  }
}

// ----- transformations

export function getFieldsetProperty<T = unknown>(target: unknown, fieldsetAccess: string[]): T {
  return get(target, fieldsetAccessToPath(fieldsetAccess));
}
export function setFieldsetProperty(
  target: object,
  fieldsetAccess: string[],
  value: unknown
): unknown {
  set(target, fieldsetAccessToPath(fieldsetAccess), value);

  return target;
}

export function fieldsetAccessToPath(access: string[]): string {
  return access.join(".");
}
