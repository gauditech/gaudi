import { Type, anyType, booleanType, integerType, stringType } from "./type";

export const builtinFunctions: { name: string; args: Type[]; result: Type }[] = [
  { name: "length", args: [stringType], result: integerType },
  { name: "lower", args: [stringType], result: stringType },
  { name: "upper", args: [stringType], result: stringType },
  { name: "now", args: [], result: integerType },
  { name: "cryptoHash", args: [stringType, integerType], result: stringType },
  { name: "cryptoCompare", args: [stringType, stringType], result: booleanType },
  { name: "cryptoToken", args: [integerType], result: stringType },
  { name: "stringify", args: [anyType], result: stringType },
];
