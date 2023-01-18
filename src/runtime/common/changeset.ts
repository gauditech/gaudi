import _, { get, indexOf, isString, set, toInteger, toString } from "lodash";

import { getRef2 } from "@src/common/refs";
import { assertUnreachable } from "@src/common/utils";
import { ActionContext } from "@src/runtime/common/action";
import { executeHook } from "@src/runtime/hooks";
import { queryFromParts } from "@src/runtime/query/build";
import { executeQuery } from "@src/runtime/query/exec";
import { DbConn } from "@src/runtime/server/dbConn";
import { Vars } from "@src/runtime/server/vars";
import {
  ActionDef,
  Changeset,
  Definition,
  FieldDef,
  FieldsetDef,
  FieldsetFieldDef,
  FilterDef,
} from "@src/types/definition";

/**
 * Build result record from given action changeset rules and give context (source) inputs.
 */
export function buildChangset(
  actionChangset: Changeset,
  actionContext: ActionContext
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
          return [name + "_id", actionContext.referenceIds[name]];
        } else if (setterKind === "fieldset-hook") {
          const args = buildChangset(setter.args, actionContext);
          return [name, executeHook(setter.code, args)];
        } else {
          assertUnreachable(setterKind);
        }
      })
      // skip empty entries
      .filter((entry) => entry.length > 0)
  );
}

export async function fetchReferenceIds(
  def: Definition,
  dbConn: DbConn,
  actions: ActionDef[],
  input: Record<string, unknown>
): Promise<Record<string, number | { kind: "noReference"; fieldsetAccess: string[] }>> {
  const referenceInputs = actions.flatMap((action) => {
    if (action.kind !== "create-one" && action.kind !== "update-one") return [];
    return Object.entries(action.changeset).flatMap(([name, setter]) => {
      if (setter.kind !== "fieldset-reference-input") return [];
      return [[name, setter] as const];
    });
  });

  const promiseEntries = referenceInputs.map(async ([name, setter]) => {
    const field = getRef2.field(def, setter.throughRefKey);

    const varName = field.name + "__input";
    const filter: FilterDef = {
      kind: "binary",
      operator: "is",
      lhs: {
        kind: "alias",
        namePath: [field.modelRefKey, field.name],
      },
      rhs: {
        kind: "variable",
        name: varName,
        type: field.type,
      },
    };
    const queryName = field.modelRefKey + "." + field.name;
    const query = queryFromParts(def, queryName, [field.modelRefKey], filter, []);
    const inputValue = _.get(input, setter.fieldsetAccess);
    const result = await executeQuery(dbConn, def, query, new Vars({ [varName]: inputValue }), []);

    if (result.length === 0) {
      return [name, { kind: "noReference", fieldsetAccess: setter.fieldsetAccess }] as const;
    }
    if (result.length > 1) {
      throw Error(
        `Failed to find reference: There are multiple (${result.length}) '${field.modelRefKey}' where field '${field.name}' is '${inputValue}'`
      );
    }

    return [name, result[0].id] as const;
  });

  return Object.fromEntries(await Promise.all(promiseEntries));
}

/**
 * This mutates endpoint fieldset.
 * If reference has no id it will add "noReference" validator to fieldset field.
 */
export function assignNoReferenceValidators(
  fieldset: FieldsetDef,
  referenceIds: Record<string, number | { kind: "noReference"; fieldsetAccess: string[] }>
): asserts referenceIds is Record<string, number> {
  console.log(referenceIds);

  Object.entries(referenceIds).forEach(([_name, value]) => {
    console.log(_name, value);
    if (typeof value === "number") return;
    const currentFieldset = getNestedFieldset(fieldset, value.fieldsetAccess);
    currentFieldset.validators.push({ name: "noReference" });
  });
}

function getNestedFieldset(fieldset: FieldsetDef, fieldsetAccess: string[]): FieldsetFieldDef {
  if (fieldsetAccess.length === 0) {
    if (fieldset.kind === "record") {
      throw Error("Unexpected FieldsetRecordDef when searching for a nested fieldset");
    }
    return fieldset;
  }
  if (fieldset.kind === "field") {
    throw Error("Unexpected FieldsetFieldDef when searching for a nested fieldset");
  }
  const [head, ...tail] = fieldsetAccess;
  return getNestedFieldset(fieldset.record[head], tail);
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
