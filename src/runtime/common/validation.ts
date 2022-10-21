import { AnySchema, ValidationError, boolean, mixed, number, object, string } from "yup";

import { ERROR_CODE_VALIDATION, createGaudiBusinessError } from "@src/runtime/server/error";
import { FieldsetDef, FieldsetFieldDef, FieldsetRecordDef } from "@src/types/definition";

// ----- validation&transformation

export async function validateEndpointFieldset<R = Record<string, unknown>>(
  fieldset: FieldsetDef,
  data: Record<string, unknown>
): Promise<R> {
  try {
    const validationSchema = buildFieldsetValidationSchema(fieldset);
    return await validateRecord(data, validationSchema);
  } catch (err: unknown) {
    if (err instanceof ValidationError) {
      // error should be an instance of Yup's ValidationError
      // https://github.com/jquense/yup#validationerrorerrors-string--arraystring-value-any-path-string

      throw createGaudiBusinessError(
        ERROR_CODE_VALIDATION,
        "Validation error",
        createRecordValidationError(err)
      );
    } else {
      throw err;
    }
  }
}

export type RecordValidationError = Pick<
  ValidationError,
  "value" | "path" | "type" | "errors" | "params" | "inner"
>;

export function createRecordValidationError(error: ValidationError): RecordValidationError {
  return {
    value: error.value,
    path: error.path,
    type: error.type,
    errors: error.errors,
    params: error.params,
    inner: error.inner,
  };
}

export async function validateRecord(record: unknown, schema: AnySchema) {
  return schema.validate(record, {
    abortEarly: false, // report ALL errors, not just the first one
  });
}

// ---------- fieldset validation builder

export function buildFieldsetValidationSchema(fieldset: FieldsetDef): AnySchema {
  if (fieldset.kind !== "record") throw new Error('Root fieldset must be of kind "record".');

  return buildObjectValidator(fieldset);
}

function processFields(field: FieldsetDef): AnySchema {
  if (field.kind === "field") {
    return buildFieldValidator(field);
  } else {
    return buildObjectValidator(field);
  }
}

function buildObjectValidator(field: FieldsetRecordDef): AnySchema {
  const fieldSchemas = Object.fromEntries(
    Object.entries(field.record).map(([name, value]) => [name, processFields(value)])
  );

  if (!field.nullable) object(fieldSchemas).required();

  return object(fieldSchemas).optional();
}

function buildFieldValidator(field: FieldsetFieldDef): AnySchema {
  if (field.type === "text") {
    let s = string();
    if (!field.nullable) s = s.required();
    return s;
  } else if (field.type === "integer") {
    let s = number();
    if (!field.nullable) s = s.required();
    return s;
  } else if (field.type === "boolean") {
    let s = boolean();
    if (!field.nullable) s = s.required();
    return s;
  } else {
    let s = mixed();
    if (!field.nullable) s = s.required();
    return s;
  }
}
