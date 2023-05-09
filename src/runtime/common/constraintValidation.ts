import _ from "lodash";

import { queryFromParts } from "../query/build.js";
import { executeQuery } from "../query/exec.js";
import { DbConn } from "../server/dbConn.js";
import { Vars } from "../server/vars.js";

import { getRef } from "@src/common/refs.js";
import {
  ActionDef,
  Definition,
  FieldsetDef,
  FieldsetFieldDef,
  TypedExprDef,
} from "@src/types/definition.js";

export type ReferenceIdResult = ValidReferenceIdResult | InvalidReferenceIdResult;
export type ValidReferenceIdResult = { fieldsetAccess: string[]; value: number };
export type InvalidReferenceIdResult = { fieldsetAccess: string[]; value: "no-reference" };

export async function fetchReferenceIds(
  def: Definition,
  dbConn: DbConn,
  actions: ActionDef[],
  input: Record<string, unknown>
): Promise<ReferenceIdResult[]> {
  const referenceInputs = actions.flatMap((action) => {
    if (action.kind !== "create-one" && action.kind !== "update-one") return [];
    return action.changeset.flatMap(({ name, setter }) => {
      if (setter.kind !== "fieldset-reference-input") return [];
      return [[name, setter] as const];
    });
  });

  const promiseEntries = referenceInputs.map(async ([_name, setter]) => {
    const field = getRef.field(def, setter.throughRefKey);

    const varName = field.name + "__input";
    const filter: TypedExprDef = {
      kind: "function",
      name: "is",
      args: [
        {
          kind: "alias",
          namePath: [field.modelRefKey, field.name],
        },
        {
          kind: "variable",
          name: varName,
          type: { kind: field.type, nullable: field.nullable },
        },
      ],
    };
    const queryName = field.modelRefKey + "." + field.name;
    const query = queryFromParts(def, queryName, [field.modelRefKey], filter, []);
    const inputValue = _.get(input, setter.fieldsetAccess);
    const result = await executeQuery(dbConn, def, query, new Vars({ [varName]: inputValue }), []);

    if (result.length === 0) {
      return { fieldsetAccess: setter.fieldsetAccess, value: "no-reference" as const };
    }
    if (result.length > 1) {
      throw Error(
        `Failed to find reference: There are multiple (${result.length}) '${field.modelRefKey}' where field '${field.name}' is '${inputValue}'`
      );
    }

    return { fieldsetAccess: setter.fieldsetAccess, value: result[0].id as number };
  });
  return Promise.all(promiseEntries);
}

/**
 * This mutates endpoint fieldset.
 * If reference has no id it will add "noReference" validator to fieldset field.
 */
export function assignNoReferenceValidators(
  fieldset: FieldsetDef,
  referenceIds: ReferenceIdResult[]
): asserts referenceIds is ValidReferenceIdResult[] {
  referenceIds.forEach((referenceIdValue) => {
    const { value, fieldsetAccess } = referenceIdValue;
    if (typeof value === "number") return;
    const currentFieldset = getNestedFieldset(fieldset, fieldsetAccess);
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
