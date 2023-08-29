import { getRef } from "@gaudi/compiler/dist/common/refs";
import {
  ActionDef,
  Definition,
  FieldDef,
  FieldSetterInput,
  FieldSetterReferenceInput,
  FieldsetDef,
  FieldsetFieldDef,
  ReferenceDef,
} from "@gaudi/compiler/dist/types/definition";
import _ from "lodash";
import { match } from "ts-pattern";

import { findIdBy } from "../query/exec";
import { DbConn } from "../server/dbConn";

export type ReferenceIdResult =
  | ValidReferenceIdResult
  | InvalidReferenceIdResult
  | InputMissingReferenceIdResult;

export type ValidReferenceIdResult = {
  kind: "reference-found";
  fieldsetAccess: string[];
  value: number;
};
type InvalidReferenceIdResult = {
  kind: "reference-not-found";
  fieldsetAccess: string[];
};
type InputMissingReferenceIdResult = {
  kind: "reference-input-missing";
  fieldsetAccess: string[];
  inputValue: null | undefined;
};

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
      const reference = getRef.reference(def, action.model, name);
      return [[reference, setter] as [ReferenceDef, FieldSetterReferenceInput]];
    });
  });

  const promiseEntries = referenceInputs.map(
    async ([reference, setter]): Promise<ReferenceIdResult> => {
      const inputValue = _.get(input, setter.fieldsetAccess);
      const { fieldsetAccess } = setter;
      if (_.isNil(inputValue)) {
        return {
          kind: "reference-input-missing",
          fieldsetAccess,
          inputValue,
        };
      }

      const resultId = await findIdBy(
        def,
        dbConn,
        reference.toModelRefKey,
        setter.through,
        inputValue
      );
      console.dir({ resultId });

      if (resultId === null) {
        return { kind: "reference-not-found", fieldsetAccess };
      }

      return {
        kind: "reference-found",
        fieldsetAccess: setter.fieldsetAccess,
        value: resultId,
      };
    }
  );
  return Promise.all(promiseEntries);
}

export async function fetchExistingUniqueValues(
  def: Definition,
  dbConn: DbConn,
  actions: ActionDef[],
  input: Record<string, unknown>,
  referenceIds: ReferenceIdResult[]
): Promise<ReferenceIdResult[]> {
  const uniqueInputs = actions.flatMap((action) => {
    if (action.kind !== "create-one" && action.kind !== "update-one") return [];
    return action.changeset.flatMap(({ name, setter }) => {
      if (setter.kind === "fieldset-input") {
        const field = getRef.field(def, action.model, name);
        if (field.unique) {
          return [[field, setter] as [FieldDef, FieldSetterInput]];
        }
      }
      return [];
    });
  });

  const inputPromiseEntries = uniqueInputs.map(
    async ([field, setter]: [FieldDef, FieldSetterInput]): Promise<ReferenceIdResult> => {
      const { fieldsetAccess } = setter;
      const inputValue = _.get(input, fieldsetAccess);
      if (_.isNil(inputValue)) {
        return {
          kind: "reference-input-missing",
          fieldsetAccess,
          inputValue,
        };
      }

      const resultId = await findIdBy(def, dbConn, field.modelRefKey, [field.name], inputValue);
      if (resultId === null) {
        return { kind: "reference-not-found", fieldsetAccess };
      } else {
        return { kind: "reference-found", fieldsetAccess, value: inputValue };
      }
    }
  );

  const referenceInputs = actions.flatMap((action) => {
    if (action.kind !== "create-one" && action.kind !== "update-one") return [];
    return action.changeset.flatMap(({ name, setter }) => {
      if (setter.kind !== "fieldset-reference-input") return [];
      const reference = getRef.reference(def, action.model, name);
      if (!reference.unique) {
        return [];
      }
      // find a value in inputs, if any
      const result = referenceIds.find((result) => {
        if (result.fieldsetAccess === setter.fieldsetAccess && result.kind === "reference-found") {
          return true;
        }
      });
      if (result) {
        return [
          [reference, setter, result] as [
            ReferenceDef,
            FieldSetterReferenceInput,
            ReferenceIdResult
          ],
        ];
      }
      return [];
    });
  });

  const refUniqPromises = referenceInputs.map(
    async ([reference, setter, result]): Promise<ReferenceIdResult> => {
      const { fieldsetAccess } = setter;

      if (result.kind !== "reference-found") {
        return result;
      }

      const refField = getRef.field(def, reference.fieldRefKey);

      const relId = await findIdBy(
        def,
        dbConn,
        reference.modelRefKey,
        [refField.name],
        result.value
      );
      if (relId === null) {
        return { kind: "reference-not-found", fieldsetAccess };
      } else {
        return { kind: "reference-found", fieldsetAccess, value: relId };
      }
    }
  );

  return Promise.all([...inputPromiseEntries, ...refUniqPromises]);
}

/**
 * This mutates endpoint fieldset.
 * If reference has no id it will add "reference-not-found" validator to fieldset field.
 */
export function assignNoReferenceValidators(
  fieldset: FieldsetDef,
  referenceIds: ReferenceIdResult[]
): asserts referenceIds is ValidReferenceIdResult[] {
  referenceIds.forEach((referenceIdResult) => {
    match(referenceIdResult)
      .with({ kind: "reference-not-found" }, ({ fieldsetAccess }) => {
        const currentFieldset = getNestedFieldset(fieldset, fieldsetAccess);
        currentFieldset.referenceNotFound = true;
      })
      .otherwise(_.noop);
  });
}

/**
 * This mutates endpoint fieldset.
 * If value already exists it will add "already-exists" validator to fieldset field.
 */
export function assignUniqueExistsValidators(
  fieldset: FieldsetDef,
  referenceIds: ReferenceIdResult[]
): asserts referenceIds is (InvalidReferenceIdResult | InputMissingReferenceIdResult)[] {
  referenceIds.forEach((referenceIdResult) => {
    match(referenceIdResult)
      .with({ kind: "reference-found" }, ({ fieldsetAccess }) => {
        const currentFieldset = getNestedFieldset(fieldset, fieldsetAccess);
        currentFieldset.uniqueExists = true;
      })
      .otherwise(_.noop);
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
