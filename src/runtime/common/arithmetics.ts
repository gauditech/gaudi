import _ from "lodash";

import { assertUnreachable, ensureEqual } from "@src/common/utils";
import { FunctionName } from "@src/types/definition";

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
    case "lower":
      return (value: string) => value.toLowerCase();
    case "upper":
      return (value: string) => value.toUpperCase();
    default:
      return assertUnreachable(name);
  }
}

interface ITyped<T> {
  name: FunctionName;
  args: T[];
}

export async function executeArithmetics<T>(
  func: ITyped<T>,
  getValue: (name: T) => Promise<unknown>
): Promise<unknown> {
  switch (func.name) {
    case "+":
    case "-":
    case "*":
    case "/":
    case ">":
    case "<":
    case ">=":
    case "<=": {
      ensureEqual(func.args.length, 2);
      const val1 = await getValue(func.args[0]);
      const val2 = await getValue(func.args[1]);

      return fnNameToFunction(func.name)(val1, val2);
    }
    case "and":
    case "or": {
      ensureEqual(func.args.length, 2);
      const val1 = await getValue(func.args[0]);
      const val2 = await getValue(func.args[1]);

      return fnNameToFunction(func.name)(val1, val2);
    }
    case "is":
    case "is not":
    case "in":
    case "not in": {
      ensureEqual(func.args.length, 2);
      const val1 = await getValue(func.args[0]);
      const val2 = await getValue(func.args[1]);

      return fnNameToFunction(func.name)(val1, val2);
    }
    case "concat": {
      const vals = await Promise.all(
        func.args.map(async (arg) => {
          const value = await getValue(arg);

          return value;
        })
      );

      return fnNameToFunction(func.name)(vals);
    }
    case "length":
    case "lower":
    case "upper": {
      ensureEqual(func.args.length, 1);
      const val = await getValue(func.args[0]);

      return fnNameToFunction(func.name)(val);
    }
    default: {
      return assertUnreachable(func.name);
    }
  }
}
