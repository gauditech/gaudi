import _, { get, indexOf, isString, set, toInteger, toString } from "lodash";

import { assertUnreachable } from "@src/common/utils";
import { ActionContext } from "@src/runtime/common/action";
import { executeHook } from "@src/runtime/hooks";
import { ChangesetDef, FieldDef, FieldSetter } from "@src/types/definition";

/**
 * Build result record from given action changeset rules and give context (source) inputs.
 */
export function buildChangset(
  actionChangsetDefinition: ChangesetDef,
  actionContext: ActionContext
): Record<string, unknown> {
  const changeset: Record<string, unknown> = {};

  function getValue(setter: FieldSetter): unknown {
    switch (setter.kind) {
      case "literal": {
        return formatFieldValue(setter.value, setter.type);
      }
      case "fieldset-input": {
        return formatFieldValue(
          getFieldsetProperty(actionContext.input, setter.fieldsetAccess),
          setter.type
        );
      }
      case "reference-value": {
        return actionContext.vars.get(setter.target.alias, setter.target.access);
      }
      case "fieldset-hook": {
        const args = buildChangset(setter.args, actionContext);
        return executeHook(setter.code, args);
      }
      case "changeset-reference": {
        // Assume that `referenceName` will already be in the changeset because
        // composer guarantees the correct order of array elements inside `ChangesetDef`
        return changeset[setter.referenceName];
      }
      case "fieldset-reference-input": {
        throw "not implemented";
      }
      default: {
        return assertUnreachable(setter);
      }
    }
  }

  actionChangsetDefinition.forEach(({ name, setter }) => {
    changeset[name] = getValue(setter);
  });
  return changeset;
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
