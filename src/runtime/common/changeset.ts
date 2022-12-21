import _, { get, indexOf, isString, set, toInteger, toString } from "lodash";

import { assertUnreachable } from "@src/common/utils";
import { ActionContext } from "@src/runtime/common/action";
import { executeHook } from "@src/runtime/hooks";
import { Changeset, FieldDef, FieldSetter } from "@src/types/definition";

type ChangesetResult = { isResolved: false } | { isResolved: true; value: unknown };

/**
 * Build result record from given action changeset rules and give context (source) inputs.
 */
export function buildChangset(
  changeset: Changeset,
  context: ActionContext
): Record<string, unknown> {
  const results = _.chain(changeset)
    .mapValues((): ChangesetResult => ({ isResolved: false }))
    .value();

  const result = _.chain(results)
    .mapValues((_, name, results) =>
      buildOrGetExsistingFieldsetResult(name, results, [name], changeset, context)
    )
    .value();
  console.log(changeset, results, result);
  return result;
}

export function buildOrGetExsistingFieldsetResult(
  name: string,
  results: Record<string, ChangesetResult>,
  requestedNames: string[],
  changeset: Changeset,
  context: ActionContext
): unknown {
  const current = results[name];
  if (current.isResolved) return current.value;

  const setter = changeset[name];

  const result = buildFieldsetResult(setter, context, (name: string) => {
    if (requestedNames.find((requested) => name === requested)) {
      throw Error(`Circular dependacy in changeset, ${name} has already been requested`);
    }

    return buildOrGetExsistingFieldsetResult(
      name,
      results,
      [...requestedNames, name],
      changeset,
      context
    );
  });
  results[name] = { isResolved: true, value: result };
  return result;
}

export function buildFieldsetResult(
  setter: FieldSetter,
  actionContext: ActionContext,
  getSiblingResult: (name: string) => unknown
): unknown {
  const setterKind = setter.kind;
  switch (setterKind) {
    case "literal": {
      return setter.type === "null" ? null : formatFieldValue(setter.value, setter.type);
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
    case "reference-from-sibling": {
      return getSiblingResult(setter.sibling);
    }
    case "fieldset-reference-input": {
      // TODO: implement "fieldset-reference-input" setters
      throw `Unsupported changeset setter kind "${setterKind}"`;
    }
    case "fieldset-hook": {
      const args = buildChangset(setter.args, actionContext);
      return executeHook(setter.code, args);
    }
    default: {
      assertUnreachable(setterKind);
    }
  }
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
): string | number | boolean | undefined | null {
  if (value == null) return value;

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
