export const primitiveTypes = ["integer", "float", "boolean", "string"] as const;

export type AnyType = { kind: "any" };
export type PrimitiveType = { kind: "primitive"; primitiveKind: (typeof primitiveTypes)[number] };
export type NullType = { kind: "null" };
export type ModelType = { kind: "model"; model: string };
export type StructType = { kind: "struct"; types: Record<string, Type> };
export type CollectionType<t extends CanBeInCollection = CanBeInCollection> = {
  kind: "collection";
  type: t;
};
export type NullableType<t extends CanBeNullType = CanBeNullType> = { kind: "nullable"; type: t };

type CanBeInCollection = CanBeNullType | AnyType;
type CanBeNullType = PrimitiveType | ModelType | StructType;

export type Type =
  | AnyType
  | PrimitiveType
  | NullType
  | ModelType
  | StructType
  | CollectionType
  | NullableType;

export const anyType: AnyType = { kind: "any" };
export const integerType: PrimitiveType = { kind: "primitive", primitiveKind: "integer" };
export const floatType: PrimitiveType = { kind: "primitive", primitiveKind: "float" };
export const booleanType: PrimitiveType = { kind: "primitive", primitiveKind: "boolean" };
export const stringType: PrimitiveType = { kind: "primitive", primitiveKind: "string" };
export const nullType: NullType = { kind: "null" };

export function addNullable(type: Type): Type {
  switch (type.kind) {
    case "primitive":
    case "model":
    case "struct":
      return { kind: "nullable", type };
    default:
      return type;
  }
}

export function addCollection(type: Type): Type {
  switch (type.kind) {
    case "primitive":
    case "model":
    case "struct":
    case "any":
      return { kind: "collection", type };
    case "nullable":
      return { kind: "collection", type: type.type };
    case "null":
    case "collection":
      return type;
  }
}

export function baseType(type: Type): AnyType | PrimitiveType | NullType | ModelType | StructType {
  switch (type.kind) {
    case "any":
    case "primitive":
    case "null":
    case "model":
    case "struct":
      return type;
    case "collection":
    case "nullable":
      return baseType(type.type);
  }
}

export function removeNull(type: Type): Type {
  if (type.kind === "nullable") return type.type;
  return type;
}

export function getTypeModel(type: Type): string | undefined {
  const base = baseType(type);
  switch (base.kind) {
    case "model":
      return base.model;
    case "any":
    case "primitive":
    case "null":
    case "struct":
      undefined;
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
    case "nullable":
      return "nullable";
    case "any":
    case "model":
    case "struct":
    case "primitive":
    case "null":
      return baseCardinality;
  }
}

const typeCategories = {
  comparable: ["integer", "float", "string"],
  addable: ["integer", "float", "string"],
  number: ["integer", "float"],
} as const;

export type TypeCategory = keyof typeof typeCategories;

export function isExpectedType(type: Type, expected: Type | TypeCategory): boolean {
  if (!type || !expected) return true;

  // typeof string means expected is a `TypeCategory`
  if (typeof expected === "string") {
    const expectedKinds: readonly string[] = typeCategories[expected];
    return type.kind === "primitive" && expectedKinds.includes(type.primitiveKind);
  }

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
