export const primitiveTypes = ["integer", "float", "boolean", "string"] as const;

export type AnyType = { kind: "unknown" };
export type PrimitiveType = { kind: "primitive"; primitiveKind: (typeof primitiveTypes)[number] };
export type NullType = { kind: "null" };
export type ModelType = { kind: "model"; model: string };
export type StructType = { kind: "struct"; types: Record<string, Type> };
export type CollectionType = { kind: "collection"; type: Type };
export type NullableType = { kind: "nullable"; type: Type };

const typeGroups = {
  comparable: ["integer", "float", "string"],
  addable: ["integer", "float", "string"],
  number: ["integer", "float"],
} as const;

export type GroupType = { kind: "group"; group: keyof typeof typeGroups };

export type Type =
  | AnyType
  | PrimitiveType
  | NullType
  | ModelType
  | StructType
  | CollectionType
  | NullableType
  | GroupType;

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
    case "group":
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
    case "group":
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
    case "group":
    case "null":
      return baseCardinality;
    case "nullable":
      return getTypeCardinality(type.type, "nullable");
  }
}

export function isExpectedType(type: Type, expected: Type): boolean {
  if (type.kind === "unknown") return true;
  if (expected.kind === "unknown") return true;

  switch (expected.kind) {
    case "primitive": {
      return type.kind === "primitive" && expected.primitiveKind === type.primitiveKind;
    }
    case "null": {
      return type.kind === "null" || type.kind === "nullable";
    }
    case "model": {
      return type.kind === "model" && expected.model === type.model;
    }
    case "struct": {
      if (type.kind !== "struct") return false;
      for (const key in expected.types) {
        if (Object.prototype.hasOwnProperty.call(expected.types, key)) {
          const expectedInner = expected.types[key];
          const gotInner = type.types[key];
          if (!isExpectedType(gotInner, expectedInner)) {
            return false;
          }
        }
      }
      return true;
    }
    case "collection": {
      return type.kind === "collection" && isExpectedType(type.type, expected.type);
    }
    case "nullable": {
      if (type.kind === "nullable") {
        return isExpectedType(type.type, expected.type);
      }
      if (type.kind === "null") {
        return true;
      }
      return isExpectedType(type, expected.type);
    }
    case "group": {
      if (type.kind === "group") return expected.group === type.group;
      const expectedKinds: readonly string[] = typeGroups[expected.group];
      return type.kind === "primitive" && expectedKinds.includes(type.primitiveKind);
    }
  }
}
