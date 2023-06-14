import _ from "lodash";

import { GAUDI_INTERNAL_TARGET_ID_ALIAS, queryFromParts, selectableId } from "../query/build";
import { executeQuery } from "../query/exec";
import { DbConn } from "../server/dbConn";
import { Vars } from "../server/vars";

import { getRef } from "@src/common/refs";
import { getTypedPathWithLeaf } from "@src/composer/utils";
import {
  ActionDef,
  Definition,
  FieldsetDef,
  FieldsetFieldDef,
  TypedExprDef,
} from "@src/types/definition";

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
      return [[action.model, name, setter] as const];
    });
  });

  const promiseEntries = referenceInputs.map(async ([model, name, setter]) => {
    const reference = getRef.reference(def, model, name);
    const tpath = getTypedPathWithLeaf(def, [reference.toModelRefKey, ...setter.through], {});
    const field = getRef.field(def, tpath.leaf.refKey);

    const varName = [...tpath.fullPath, "_input"].join("_");
    const filter: TypedExprDef = {
      kind: "function",
      name: "is",
      args: [
        {
          kind: "alias",
          namePath: tpath.fullPath,
        },
        {
          kind: "variable",
          name: varName,
          type: { kind: field.type, nullable: field.nullable },
        },
      ],
    };
    const queryName = tpath.fullPath.join(".");
    const query = queryFromParts(def, queryName, _.initial(tpath.fullPath), filter, [
      selectableId(_.dropRight(tpath.fullPath, 2)),
    ]);
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

    return {
      fieldsetAccess: setter.fieldsetAccess,
      value: result[0][GAUDI_INTERNAL_TARGET_ID_ALIAS] as number,
    };
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
