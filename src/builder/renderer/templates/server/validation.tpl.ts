import { oneLine, source } from "common-tags";

import {
  renderBoolean,
  renderMixed,
  renderNumber,
  renderObject,
  renderRequired,
  renderString,
  renderValidator,
} from "@src/builder/renderer/templates/util/validation";
import { FieldsetDef, FieldsetFieldDef, FieldsetRecordDef } from "@src/types/definition";

export function renderFieldsetValidationSchema(fieldset: FieldsetDef): string {
  if (fieldset.kind !== "record") throw new Error('Root fieldset must be of kind "record".');

  // prettier-ignore
  return source`
    ${renderValidator()}
    ${renderFieldRecord(fieldset)}
  `;
}

function processFields(field: FieldsetDef): string {
  if (field.kind === "field") {
    return renderField(field);
  } else {
    return renderObject(field.record, processFields);
  }
}

function renderFieldRecord(field: FieldsetRecordDef): string {
  return source`
    ${renderObject(field.record, processFields)}
    ${renderRequired(!field.nullable)}
  `;
}

function renderField(field: FieldsetFieldDef): string {
  if (field.type === "text") {
    return oneLine`
        ${renderString()}
        ${renderRequired(!field.nullable)}
    `;
  } else if (field.type === "integer") {
    return oneLine`
        ${renderNumber()}
        ${renderRequired(!field.nullable)}
    `;
  } else if (field.type === "boolean") {
    return oneLine`
        ${renderBoolean()}
        ${renderRequired(!field.nullable)}
    `;
  } else {
    return oneLine`
        ${renderMixed()}
        ${renderRequired(!field.nullable)}
    `;
  }
}
