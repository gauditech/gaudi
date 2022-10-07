import { Definition, PathFragment } from "@src/types/definition";

/*
 * Template helper functions for Gaudi definition
 */

export function modelDbName(modelRefKey: string, definition: Definition) {
  return (definition.models || []).find((model) => model.refKey === modelRefKey)?.dbname;
}

export function fieldDbName(modelRefKey: string, fieldRefKey: string, definition: Definition) {
  return (definition.models || [])
    .find((model) => model.refKey === modelRefKey)
    ?.fields.find((field) => field.refKey === fieldRefKey)?.dbname;
}

export function typeToDbType(type: string) {
  if (type === "serial") {
    return "Int";
  } else if (type === "integer") {
    return "Int";
  } else if (type === "text") {
    return "String";
  } else if (type === "boolean") {
    return "Boolean";
  }

  throw "UNHANDLED_GAUDI_TYPE";
}

export function buildEndpointPath(parts: PathFragment[]): string {
  return parts.reduce((accum, part) => {
    const pathPart =
      part.type === "numeric" || part.type === "text" ? `:${part.varname}` : part.value;
    return `${accum}/${pathPart}`;
  }, "");
}
