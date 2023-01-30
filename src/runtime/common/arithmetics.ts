import _ from "lodash";

import { assertUnreachable } from "@src/common/utils";
import { FunctionName, TypedExprDef } from "@src/types/definition";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function fnNameToFunction(name: FunctionName): (...args: any[]) => unknown {
  switch (name) {
    case "+":
      return _.add;
    case "-":
      return _.subtract;
    case "*":
      return _.multiply;
    case "/":
      return _.divide;
    case "<":
      return _.lt;
    case ">":
      return _.gt;
    case "<=":
      return _.lte;
    case ">=":
      return _.gte;
    case "is":
      return _.isEqual;
    case "is not":
      return (a: unknown, b: unknown) => !_.isEqual(a, b);
    case "and":
      return (a: unknown, b: unknown) => a && b;
    case "or":
      return (a: unknown, b: unknown) => a || b;
    case "in":
      return _.includes;
    case "not in":
      return (a: unknown[], v: unknown) => !_.includes(a, v);
    case "concat":
      return (a: unknown[]) => a.join("");
    case "length":
      return (value: string) => value.length;
    default:
      return assertUnreachable(name);
  }
}

// export async function evaluateExpression(
//   exp: TypedExprDef,
//   getValue: (name: string) => Promise<unknown>
// ): unknown {}
