import _ from "lodash";
import { match } from "ts-pattern";

import { executeHook } from "../hooks";
import { executeTypedExpr } from "../server/endpoints";
import { Vars } from "../server/vars";

import { ensureExists } from "@src/common/utils";
import { BusinessError } from "@src/runtime/server/error";
import {
  Definition,
  FieldsetDef,
  FieldsetFieldDef,
  FieldsetRecordDef,
  ValidateExprCallDef,
  ValidateExprDef,
} from "@src/types/definition";

// ----- validation&transformation

export async function validateEndpointFieldset(
  def: Definition,
  fieldset: FieldsetDef,
  data: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const error = await validate(def, fieldset, data);
  if (error) {
    throw new BusinessError("ERROR_CODE_VALIDATION", "Validation error", error);
  }
  return data;
}

export type ValidateError = ValidateRecordError | ValidateFieldError;
export type ValidateRecordError = {
  [P in string]: ValidateRecordError | ValidateFieldError;
};

export type ValidateFieldError = { code: string; params: Record<string, unknown> }[];

async function validate(
  def: Definition,
  fieldset: FieldsetDef,
  value: unknown
): Promise<ValidateError | undefined> {
  switch (fieldset.kind) {
    case "record":
      return await validateRecord(def, fieldset, value);
    case "field":
      return await validateField(def, fieldset, value);
  }
}

async function validateRecord(
  def: Definition,
  fieldsetRecord: FieldsetRecordDef,
  record: unknown
): Promise<ValidateError | undefined> {
  if (record == undefined) {
    if (fieldsetRecord.nullable) {
      return undefined;
    }
    return [{ code: "required", params: {} }];
  }
  if (!isRecord(record)) {
    return [{ code: "unexpected-type", params: { value: record, expected: "object" } }];
  }

  const result: ValidateRecordError = {};
  for (const [name, fieldset] of Object.entries(fieldsetRecord.record)) {
    const recordResult = await validate(def, fieldset, record[name]);
    if (recordResult) {
      result[name] = recordResult;
    }
  }

  return _.isEmpty(result) ? undefined : result;
}

function isRecord(record: unknown): record is Record<string, unknown> {
  return typeof record === "object" && record != undefined && !Array.isArray(record);
}

async function validateField(
  def: Definition,
  fieldset: FieldsetFieldDef,
  field: unknown
): Promise<ValidateFieldError | undefined> {
  if (field === undefined) {
    return fieldset.required ? [{ code: "required", params: {} }] : undefined;
  }
  if (field === null) {
    return fieldset.nullable ? undefined : [{ code: "is-not-nullable", params: {} }];
  }

  const isCorrectType = match(fieldset.type)
    .with("integer", () => typeof field === "number" && Number.isInteger(field))
    .with("float", () => typeof field === "number")
    .with("boolean", () => typeof field === "boolean")
    .with("string", () => typeof field === "string")
    .exhaustive();
  if (!isCorrectType) {
    return [{ code: "unexpected-type", params: { value: field, expected: fieldset.type } }];
  }

  return fieldset.validate
    ? await executeValidateExpr(def, fieldset.validate, field)
    : fieldset.referenceNotFound
    ? [{ code: "reference-not-found", params: { value: field } }]
    : undefined;
}

async function executeValidateExpr(
  def: Definition,
  validate: ValidateExprDef,
  field: unknown
): Promise<ValidateFieldError | undefined> {
  if (validate.kind === "call") {
    return executeValidateExprCall(def, validate, field);
  }

  const errors = _.compact(
    _.concat(
      ...(await Promise.all(validate.exprs.map((expr) => executeValidateExpr(def, expr, field))))
    )
  );

  if (errors.length === 0) {
    return undefined;
  }

  if (validate.kind === "and") {
    return errors;
  } else {
    return [{ code: "or", params: { errors } }];
  }
}

async function executeValidateExprCall(
  def: Definition,
  validate: ValidateExprCallDef,
  field: unknown
): Promise<ValidateFieldError | undefined> {
  const validator = def.validators.find((v) => v.name === validate.validator);
  ensureExists(validator);
  const tailArgs = await Promise.all(validate.args.map((arg) => executeTypedExpr(arg, new Vars())));
  const args = [field, ...tailArgs];

  const params: Record<string, unknown> = {};
  for (let i = 0; i < validator.args.length; i++) {
    const name = validator.args[i].name;
    const value = args[i];
    params[name] = value;
  }

  const contextVars = new Vars(params);

  const assertResult = await match(validator.assert)
    .with({ kind: "expr" }, ({ expr }) => executeTypedExpr(expr, contextVars))
    .with({ kind: "hook" }, async ({ hook }) => {
      const argEntries = await Promise.all(
        hook.args.map(
          async ({ name, expr }) => [name, await executeTypedExpr(expr, contextVars)] as const
        )
      );
      const args = Object.fromEntries(argEntries);
      return executeHook(def, hook.hook, args);
    })
    .exhaustive();

  if (assertResult) {
    return undefined;
  }
  return [{ code: validator.error.code, params }];
}
