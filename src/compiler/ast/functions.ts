import { Type, unknownType } from "./type";

const stringT: Type = { kind: "primitive", primitiveKind: "string" };
const integerT: Type = { kind: "primitive", primitiveKind: "integer" };
const booleanT: Type = { kind: "primitive", primitiveKind: "boolean" };
const numberCollectionT: Type = { kind: "collection", type: { kind: "group", group: "number" } };

export const builtinFunctions = [
  { name: "length", args: [stringT], result: integerT },
  { name: "lower", args: [stringT], result: stringT },
  { name: "upper", args: [stringT], result: stringT },
  { name: "now", args: [], result: integerT },
  { name: "cryptoHash", args: [stringT, integerT], result: stringT },
  { name: "cryptoCompare", args: [stringT, stringT], result: booleanT },
  { name: "cryptoToken", args: [integerT], result: stringT },
  { name: "stringify", args: [unknownType], result: stringT },
  { name: "count", args: [{ kind: "collection", type: unknownType }], result: integerT },
  { name: "sum", args: [numberCollectionT] },
] as const;
