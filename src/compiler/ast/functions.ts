import { Type } from "./type";

export const builtinFunctions = [
  { name: "length", args: [Type.string], result: Type.integer },
  { name: "lower", args: [Type.string], result: Type.string },
  { name: "upper", args: [Type.string], result: Type.string },
  { name: "now", args: [], result: Type.integer },
  { name: "cryptoHash", args: [Type.string, Type.integer], result: Type.string },
  { name: "cryptoCompare", args: [Type.string, Type.string], result: Type.boolean },
  { name: "cryptoToken", args: [Type.integer], result: Type.string },
  { name: "stringify", args: [Type.any], result: Type.string },
  { name: "count", args: [Type.collection(Type.any)], result: Type.integer },
  { name: "sum", args: [Type.collection(Type.any)] },
] as const;
