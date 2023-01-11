import _, { get, indexOf, isString, set, toInteger, toString } from "lodash";

import { assertUnreachable } from "@src/common/utils";
import { ActionContext } from "@src/runtime/common/action";
import { executeHook } from "@src/runtime/hooks";
import { queryFromParts } from "@src/runtime/query/build";
import { executeQuery } from "@src/runtime/query/exec";
import { DbConn } from "@src/runtime/server/dbConn";
import { Vars } from "@src/runtime/server/vars";
import { Changeset, Definition, FieldDef, FilterDef } from "@src/types/definition";

/**
 * Build result record from given action changeset rules and give context (source) inputs.
 */
export function buildChangset(
  actionChangset: Changeset,
  actionContext: ActionContext,
  referenceIds: Record<string, number>
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(actionChangset)
      .map(([name, setter]) => {
        // TODO: format values by type
        const setterKind = setter.kind;
        if (setterKind === "literal") {
          return [
            name,
            setter.type === "null" ? null : formatFieldValue(setter.value, setter.type),
          ];
        } else if (setterKind === "fieldset-input") {
          return [
            name,
            formatFieldValue(
              getFieldsetProperty(actionContext.input, setter.fieldsetAccess),
              setter.type
            ),
          ];
        } else if (setterKind === "reference-value") {
          return [name, actionContext.vars.get(setter.target.alias, setter.target.access)];
        } else if (setterKind === "fieldset-reference-input") {
          return [name + "_id", referenceIds[name]];
        } else if (setterKind === "fieldset-hook") {
          const args = buildChangset(setter.args, actionContext, referenceIds);
          return [name, executeHook(setter.code, args)];
        } else {
          assertUnreachable(setterKind);
        }
      })
      // skip empty entries
      .filter((entry) => entry.length > 0)
  );
}

export async function getReferenceIds(
  def: Definition,
  dbConn: DbConn,
  actionChangset: Changeset,
  actionContext: ActionContext
): Promise<Record<string, number>> {
  const promiseEntries = Object.entries(actionChangset).map(async ([name, setter]) => {
    if (setter.kind !== "fieldset-reference-input") return null;

    const inputValue = _.get(actionContext.input, setter.fieldsetAccess);
    const varName = setter.throughField.name + "__input";
    const filter: FilterDef = {
      kind: "binary",
      operator: "is",
      lhs: {
        kind: "alias",
        namePath: [setter.throughField.modelRefKey, setter.throughField.name],
      },
      rhs: {
        kind: "variable",
        name: varName,
        type: setter.throughField.type,
      },
    };
    const queryName = setter.throughField.modelRefKey + "." + setter.throughField.name;
    const query = queryFromParts(def, queryName, [setter.throughField.modelRefKey], filter, []);
    const result = await executeQuery(dbConn, def, query, new Vars({ [varName]: inputValue }), []);

    if (result.length === 0) {
      throw Error(
        `Failed to find reference: Can't find '${setter.throughField.modelRefKey}' where field '${setter.throughField.name}' is '${inputValue}'`
      );
    }
    if (result.length > 1) {
      throw Error(
        `Failed to find reference: There are multiple (${result.length}) '${setter.throughField.modelRefKey}' where field '${setter.throughField.name}' is '${inputValue}'`
      );
    }

    return [name, result[0].id] as const;
  });
  return Object.fromEntries(_.compact(await Promise.all(promiseEntries)));
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
