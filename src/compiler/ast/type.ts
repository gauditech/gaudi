export const primitiveTypes = ["integer", "float", "boolean", "string"] as const;

export type AnyType = { kind: "unknown" };
export type PrimitiveType = { kind: "primitive"; primitiveKind: (typeof primitiveTypes)[number] };
export type NullType = { kind: "null" };
export type ModelType = { kind: "model"; model: string };
export type StructType = { kind: "struct"; types: Record<string, Type> };
export type CollectionType = { kind: "collection"; type: Type };
export type NullableType = { kind: "nullable"; type: Type };

export type Type =
  | AnyType
  | PrimitiveType
  | NullType
  | ModelType
  | StructType
  | CollectionType
  | NullableType;

export const unknownType: Type = { kind: "unknown" };

// types are generated in a way that nesting will always be collection > nullable
export type TypeModifier = "collection" | "nullable";

export function addTypeModifier(type: Type, modifier: TypeModifier): Type {
  if (type.kind === "unknown") return type;

  switch (modifier) {
    case "nullable": {
      if (type.kind === "nullable" || type.kind === "collection") return type;
      return { kind: "nullable", type };
    }
    case "collection": {
      type = removeTypeModifier(type, "nullable");
      if (type.kind === "collection") return type;
      return { kind: "collection", type };
    }
  }
}

export function removeTypeModifier(type: Type, ...modifiers: TypeModifier[]): Type {
  switch (type.kind) {
    case "unknown":
    case "model":
    case "struct":
    case "primitive":
    case "null":
      return type;
    default: {
      return modifiers.includes(type.kind)
        ? type.type
        : { ...type, type: removeTypeModifier(type.type, ...modifiers) };
    }
  }
}

export function getTypeModel(type?: Type): string | undefined {
  if (!type) return undefined;
  switch (type.kind) {
    case "unknown":
    case "primitive":
    case "null":
    case "struct":
      return undefined;
    case "model":
      return type.model;
    default:
      return getTypeModel(type.type);
  }
}

export type TypeCardinality = "collection" | "nullable" | "one";

export function getTypeCardinality(
  type: Type,
  baseCardinality: TypeCardinality = "one"
): TypeCardinality {
  if (baseCardinality === "collection") return "collection";
  switch (type.kind) {
    case "collection":
      return "collection";
    case "unknown":
    case "model":
    case "struct":
    case "primitive":
    case "null":
      return baseCardinality;
    case "nullable":
      return getTypeCardinality(type.type, "nullable");
  }
}

const typeCategories = {
  comparable: ["integer", "float", "string"],
  addable: ["integer", "float", "string"],
  number: ["integer", "float"],
} as const;

export type TypeCategory = keyof typeof typeCategories;

export function isExpectedType(type: Type, expected: Type | TypeCategory): boolean {
  if (type.kind === "unknown") return true;

  // typeof string means expected is a `TypeCategory`
  if (typeof expected === "string") {
    const expectedKinds: readonly string[] = typeCategories[expected];
    return type.kind === "primitive" && expectedKinds.includes(type.primitiveKind);
  }

  if (expected.kind === "unknown") return true;

  if (expected.kind === "collection" && type.kind === "collection") {
    return isExpectedType(type.type, expected.type);
  }
  if (expected.kind === "nullable") {
    if (type.kind === "nullable") {
      return isExpectedType(type.type, expected.type);
    }
    if (type.kind === "null") {
      return true;
    }
    return isExpectedType(type, expected.type);
  }
  if (expected.kind === "model" && type.kind === "model") {
    return expected.model === type.model;
  }
  if (expected.kind === "primitive" && type.kind === "primitive") {
    return expected.primitiveKind === type.primitiveKind;
  }

  return false;
}
