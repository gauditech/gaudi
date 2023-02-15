import _, { get, indexOf, isString, set, toInteger, toString } from "lodash";

import { executeArithmetics } from "./arithmetics";

import { assertUnreachable, ensureEqual, ensureNot } from "@src/common/utils";
import { ActionContext } from "@src/runtime/common/action";
import { executeHook } from "@src/runtime/hooks";
import { ChangesetDef, FieldDef, FieldSetter } from "@src/types/definition";

type Changeset = Record<string, unknown>;

/**
 * Build result record from given action changeset rules and give context (source) inputs.
 */
export async function buildChangeset(
  actionChangsetDefinition: ChangesetDef,
  actionContext: ActionContext,
  // `changesetContext` is used for hooks, to be able to pass the "parent context" changeset
  changesetContext: Changeset = {}
): Promise<Changeset> {
  const changeset: Changeset = {};

  async function getValue(setter: FieldSetter): Promise<unknown> {
    switch (setter.kind) {
      case "literal": {
        return formatFieldValue(setter.value, setter.type);
      }
      case "fieldset-virtual-input":
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
        const args = await buildChangeset(setter.args, actionContext, changeset);
        return await executeHook(setter.code, args);
      }
      case "changeset-reference": {
        /**
         * Composer guarantees the correct order of array elements, so `setter.referenceName` should
         * be in the context and we should be able to return `changeset[setter.referenceName]`.
         *
         * However, hooks inherit the action changeset context, but also build their own changeset,
         * so we need to check which changeset `setter.referenceName` belongs to. In other words,
         * it's possible that `setter.referenceName in changeset` is `false` when building a hooks changeset,
         * but in that case we can assume it's in the `changesetContext`.
         *
         * NOTE the following code wouldn't work because `undefined` is a valid changeset value:
         * `return changeset[setter.referenceName] || changesetContext[setter.referenceName];`
         */
        if (setter.referenceName in changeset) {
          return changeset[setter.referenceName];
        } else {
          ensureEqual(setter.referenceName in changesetContext, true);
          return changesetContext[setter.referenceName];
        }
      }
      case "fieldset-reference-input": {
        const referenceIdResult = actionContext.referenceIds.find((result) =>
          _.isEqual(result.fieldsetAccess, setter.fieldsetAccess)
        );
        ensureNot(referenceIdResult, undefined);
        return referenceIdResult.value;
      }
      case "function": {
        return executeArithmetics(setter, (s) => getValue(s));
      }
      case "context-reference":
        return actionContext.vars.get(setter.referenceName);

      default: {
        return assertUnreachable(setter);
      }
    }
  }

  for (const { name, setter } of actionChangsetDefinition) {
    switch (setter.kind) {
      case "fieldset-reference-input": {
        changeset[name + "_id"] = await getValue(setter);
        break;
      }
      default: {
        changeset[name] = await getValue(setter);
      }
    }
  }

  /**
   * Remove all the virtual fields' values from the changeset.
   */
  for (const { name, setter } of actionChangsetDefinition) {
    switch (setter.kind) {
      case "fieldset-virtual-input": {
        delete changeset[name];
      }
    }
  }

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
