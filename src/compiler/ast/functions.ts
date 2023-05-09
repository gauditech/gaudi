import { Type } from "./type.js";

const stringT: Type = { kind: "primitive", primitiveKind: "string" };
const integerT: Type = { kind: "primitive", primitiveKind: "integer" };
const booleanT: Type = { kind: "primitive", primitiveKind: "boolean" };

export const builtinFunctions: { name: string; args: Type[]; result: Type }[] = [
  { name: "length", args: [stringT], result: integerT },
  { name: "lower", args: [stringT], result: stringT },
  { name: "upper", args: [stringT], result: stringT },
  { name: "now", args: [], result: integerT },
  { name: "cryptoHash", args: [stringT, integerT], result: stringT },
  { name: "cryptoCompare", args: [stringT, stringT], result: booleanT },
  { name: "cryptoToken", args: [integerT], result: stringT },
  { name: "stringify", args: [{ kind: "unknown" }], result: stringT },
];
