export const primitiveTypes = ["integer", "float", "boolean", "string"] as const;

export type AnyType = { kind: "any" };
export type PrimitiveType = { kind: "primitive"; primitiveKind: (typeof primitiveTypes)[number] };
export type NullType = { kind: "null" };
export type ModelType = { kind: "model"; model: string };
export type StructType = {
  kind: "struct";
  types: Record<string, Type>;
};
export type CollectionType<t extends CanBeInCollection = CanBeInCollection> = {
  kind: "collection";
  type: t;
};
export type NullableType<t extends CanBeNullable = CanBeNullable> = { kind: "nullable"; type: t };

type BaseType = AnyType | PrimitiveType | NullType | ModelType | StructType;
type CanBeInCollection = CanBeNullable | AnyType;
type CanBeNullable = PrimitiveType | ModelType | StructType;

export type Type =
  | AnyType
  | PrimitiveType
  | NullType
  | ModelType
  | StructType
  | CollectionType
  | NullableType;

export const Type = {
  any: { kind: "any" } as AnyType,
  primitive: (primitiveKind: (typeof primitiveTypes)[number]): PrimitiveType => ({
    kind: "primitive",
    primitiveKind,
  }),
  integer: { kind: "primitive", primitiveKind: "integer" } as PrimitiveType,
  float: { kind: "primitive", primitiveKind: "float" } as PrimitiveType,
  boolean: { kind: "primitive", primitiveKind: "boolean" } as PrimitiveType,
  string: { kind: "primitive", primitiveKind: "string" } as PrimitiveType,
  null: { kind: "null" } as NullType,
  model: (model: string): ModelType => ({ kind: "model", model }),
  struct: (types: Record<string, Type>): StructType => ({ kind: "struct", types }),
  collection: createCollection,
  nullable: createNullable,
};

function createNullable<t extends Type>(type: t): t extends CanBeNullable ? NullableType<t> : t;
function createNullable(type: Type): Type {
  switch (type.kind) {
    case "primitive":
    case "model":
    case "struct":
      return { kind: "nullable", type };
    default:
      return type;
  }
}

function createCollection<t extends Type>(
  type: t
): t extends CanBeInCollection
  ? CollectionType<t>
  : t extends NullableType
  ? CollectionType<t["type"]>
  : t;
function createCollection(type: Type): Type {
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

export function baseType<t extends Type>(
  type: t
): t extends CollectionType | NullableType ? t["type"] : t;
export function baseType(type: Type): BaseType {
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

export function removeNullable<t extends Type>(type: t): t extends NullableType ? t["type"] : t;
export function removeNullable(type: Type): Type {
  if (type.kind === "nullable") return type.type;
  return type;
}

export function getTypeModel<t extends Type>(
  type: t
): t extends ModelType ? string : t extends BaseType ? undefined : undefined | string;
export function getTypeModel(type: Type): string | undefined {
  const base = baseType(type);
  switch (base.kind) {
    case "model":
      return base.model;
    case "any":
    case "primitive":
    case "null":
    case "struct":
      return undefined;
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
    case "nullable":
      return type.kind;
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
  if (type.kind === "any") return true;

  // typeof string means expected is a `TypeCategory`
  if (typeof expected === "string") {
    const expectedKinds: readonly string[] = typeCategories[expected];
    return type.kind === "primitive" && expectedKinds.includes(type.primitiveKind);
  }

  switch (expected.kind) {
    case "any":
      return true;
    case "primitive":
      return type.kind === "primitive" && expected.primitiveKind === type.primitiveKind;
    case "null":
      return type.kind === "null";
    case "model":
      return type.kind === "model" && expected.model === type.model;
    case "struct":
      if (type.kind !== "struct") return false;
      for (const key in type.types) {
        if (Object.prototype.hasOwnProperty.call(type.types, key)) {
          const typeChild = type.types[key];
          const expectedChild = expected.types[key];
          if (!isExpectedType(typeChild, expectedChild)) return false;
        }
      }
      return true;
    case "collection":
      return type.kind === "collection" && isExpectedType(type.type, expected.type);
    case "nullable":
      if (type.kind === "nullable") {
        return isExpectedType(type.type, expected.type);
      }
      if (type.kind === "null") {
        return true;
      }
      return isExpectedType(type, expected.type);
  }
}
