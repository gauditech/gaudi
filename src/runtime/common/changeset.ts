import _, { get, indexOf, isString, set, toInteger, toString } from "lodash";

import { assertUnreachable } from "@src/common/utils";
import { ActionContext } from "@src/runtime/common/action";
import { executeHook } from "@src/runtime/hooks";
import { ChangesetDef, FieldDef } from "@src/types/definition";

/**
 * Build result record from given action changeset rules and give context (source) inputs.
 */
export function buildChangset(
  actionChangset: ChangesetDef,
  actionContext: ActionContext
): Record<string, unknown> {
  return Object.fromEntries(
    actionChangset
      .map(({ name, setter: operation }) => {
        // TODO: format values by type
        const setterKind = operation.kind;
        if (setterKind === "literal") {
          return [
            name,
            operation.type === "null" ? null : formatFieldValue(operation.value, operation.type),
          ];
        } else if (setterKind === "fieldset-input") {
          return [
            name,
            formatFieldValue(
              getFieldsetProperty(actionContext.input, operation.fieldsetAccess),
              operation.type
            ),
          ];
        } else if (setterKind === "reference-value") {
          return [name, actionContext.vars.get(operation.target.alias, operation.target.access)];
        } else if (setterKind === "fieldset-reference-input") {
          // TODO: implement "fieldset-reference-input" setters
          throw `Unsupported changeset setter kind "${setterKind}"`;
        } else if (setterKind === "fieldset-hook") {
          const args = buildChangset(operation.args, actionContext);
          return [name, executeHook(operation.code, args)];
        } else {
          assertUnreachable(setterKind);
        }
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
  type: FieldDef["type"] | "null"
): string | number | boolean | undefined | null {
  if (_.isNil(value)) return value;

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
