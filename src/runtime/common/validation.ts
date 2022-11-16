import {
  AnySchema,
  BaseSchema,
  BooleanSchema,
  NumberSchema,
  StringSchema,
  ValidationError,
  boolean,
  number,
  object,
  string,
} from "yup";

import { getHook } from "../hooks";

import { assertUnreachable } from "@src/common/utils";
import { BusinessError } from "@src/runtime/server/error";
import {
  FieldsetDef,
  FieldsetFieldDef,
  FieldsetRecordDef,
  HookValidator,
} from "@src/types/definition";

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

      throw new BusinessError(
        "ERROR_CODE_VALIDATION",
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

  return buildObjectValidationSchema(fieldset);
}

function processFields(name: string, field: FieldsetDef): AnySchema {
  if (field.kind === "field") {
    return buildFieldValidationSchema(name, field);
  } else {
    return buildObjectValidationSchema(field);
  }
}

function buildObjectValidationSchema(field: FieldsetRecordDef): AnySchema {
  const fieldSchemas = Object.fromEntries(
    Object.entries(field.record).map(([name, value]) => [name, processFields(name, value)])
  );

  if (!field.nullable) object(fieldSchemas).required();

  return object(fieldSchemas).optional();
}

function buildFieldValidationSchema(name: string, field: FieldsetFieldDef): AnySchema {
  if (field.type === "text") {
    // start with nullable because it's the only way to
    let s = string();

    if (field.nullable) {
      // TODO: yup's types don't allow expanding return type to `string | undefined | null`
      s = s.nullable() as StringSchema;
    }
    if (field.required) {
      // everything except `undefined`
      s = s.defined();
    }

    field.validators.forEach((v) => {
      if (v.name === "minLength") {
        s = s.min(v.args[0].value);
      } else if (v.name === "maxLength") {
        s = s.max(v.args[0].value);
      } else if (v.name === "isEmail") {
        s = s.email();
      } else if (v.name === "isTextEqual") {
        // TODO: s.equals returns BaseSchema which doesn't fit StringSchema
        s = s.equals<string>([v.args[0].value]) as StringSchema;
      } else if (v.name === "hook") {
        s = buildHookSchema(name, v, s);
      }
    });

    return s;
  } else if (field.type === "integer") {
    let s = number();

    if (field.nullable) {
      // TODO: yup's types don't allow expanding return type to `number | undefined | null`
      s = s.nullable() as NumberSchema;
    }
    if (field.required) {
      // everything except `undefined`
      s = s.defined();
    }

    field.validators.forEach((v) => {
      if (v.name === "min") {
        s = s.min(v.args[0].value);
      } else if (v.name === "max") {
        s = s.max(v.args[0].value);
      } else if (v.name === "isIntEqual") {
        // TODO: s.equals returns BaseSchema which doesn't fit NumberSchema
        s = s.equals([v.args[0].value]) as NumberSchema;
      } else if (v.name === "hook") {
        s = buildHookSchema(name, v, s);
      }
    });

    return s;
  } else if (field.type === "boolean") {
    let s = boolean();

    // NOTE: boolean schema cannot be "nullable"

    if (field.required) {
      // everything except `undefined`
      s = s.defined();
    }

    field.validators.forEach((v) => {
      if (v.name === "isBoolEqual") {
        // TODO: s.equals returns BaseSchema which doesn't fit BooleanSchema
        s = s.equals([v.args[0].value]) as BooleanSchema;
      } else if (v.name === "hook") {
        s = buildHookSchema(name, v, s);
      }
    });

    return s;
  } else {
    assertUnreachable(field.type);
  }
}

function buildHookSchema<S extends BaseSchema>(
  name: string,
  validator: HookValidator,
  schema: S
): S {
  let testFn: (value: unknown) => boolean;
  const code = validator.code;
  const args = validator.args;
  const hasArg = args.find((arg) => arg.name === name) != null;

  if (code.kind === "inline") {
    testFn = (value) => {
      return eval(hasArg ? `const ${name} = ${JSON.stringify(value)};${code.inline}` : code.inline);
    };
  } else {
    testFn = (value) => {
      const hook = getHook(code.file, code.target);
      if (hasArg) {
        return hook(value);
      } else {
        return hook();
      }
    };
  }

  return schema.test(testFn);
}
