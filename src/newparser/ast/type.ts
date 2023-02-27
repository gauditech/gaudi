export const primitiveTypes = ["integer", "float", "boolean", "null", "string"] as const;

export type AnyType = { kind: "unknown" };
export type PrimitiveType = { kind: "primitive"; primitiveKind: typeof primitiveTypes[number] };
export type ModelType = { kind: "model"; model: string };
export type CollectionType = { kind: "collection"; type: Type };
export type NullableType = { kind: "nullable"; type: Type };
export type UniqueType = { kind: "unique"; type: Type };

export type Type = AnyType | PrimitiveType | ModelType | CollectionType | NullableType | UniqueType;

export const unknownType: Type = { kind: "unknown" };

export type TypeModifier = "collection" | "nullable" | "unique";

export function addTypeModifier(type: Type, modifier: TypeModifier): Type {
  if (type.kind === "unknown") return type;

  switch (modifier) {
    case "nullable": {
      if (type.kind === "nullable" || type.kind === "collection") return type;
      if (type.kind === "unique") {
        return { ...type, type: addTypeModifier(type.type, "nullable") };
      }
      return { kind: "nullable", type };
    }
    case "unique": {
      if (type.kind === "unique") return type;
      if (type.kind === "collection") {
        return { ...type, type: addTypeModifier(type.type, "unique") };
      }
      return { kind: "unique", type };
    }
    case "collection": {
      type = removeTypeModifier(type, "nullable");
      if (type.kind === "collection") return type;
      return { kind: "collection", type };
    }
  }
}

export function removeTypeModifier(type: Type, modifier: TypeModifier): Type {
  switch (type.kind) {
    case "unknown":
    case "model":
    case "primitive":
      return type;
    default: {
      return type.kind === modifier
        ? type.type
        : { ...type, type: removeTypeModifier(type.type, modifier) };
    }
  }
}

export function hasTypeModifier(type: Type, modifier: TypeModifier): boolean {
  switch (type.kind) {
    case "unknown":
      return true;
    case "model":
    case "primitive":
      return false;
    case modifier:
      return true;
    default:
      return hasTypeModifier(type.type, modifier);
  }
}

export function getBaseType(type: Type): AnyType | PrimitiveType | ModelType {
  switch (type.kind) {
    case "unknown":
    case "model":
    case "primitive":
      return type;
    default:
      return getBaseType(type.type);
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
    case "primitive":
      return baseCardinality;
    case "unique":
      return getTypeCardinality(type.type, baseCardinality);
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
  // unique is ignored
  if (type.kind === "unique") {
    return isExpectedType(type.type, expected);
  }

  if (typeof expected === "string") {
    const expectedKinds: readonly string[] = typeCategories[expected];
    return type.kind === "primitive" && expectedKinds.includes(type.primitiveKind);
  }

  if (expected.kind === "unknown") return true;

  // unique is ignored
  if (expected.kind === "unique") {
    return isExpectedType(type, expected.type);
  }

  if (expected.kind === "collection" && type.kind === "collection") {
    return isExpectedType(type.type, expected.type);
  }
  if (expected.kind === "nullable" && type.kind === "nullable") {
    return isExpectedType(type.type, expected.type);
  }
  if (expected.kind === "model" && type.kind === "model") {
    return expected.model === type.model;
  }
  if (expected.kind === "primitive" && type.kind === "primitive") {
    return expected.primitiveKind === type.primitiveKind;
  }

  return false;
}
