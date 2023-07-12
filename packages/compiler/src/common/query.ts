import { assertUnreachable, ensureEqual } from "@compiler/common/utils";
import { SelectDef, SelectItem, TypedExprDef } from "@compiler/types/definition";
import _ from "lodash";
import { match } from "ts-pattern";

export function transformSelectPath(select: SelectDef, from: string[], to: string[]): SelectDef {
  return select.map((item: SelectItem): SelectItem => {
    return match(item)
      .with({ kind: "expression" }, (item) => ({
        ...item,
        expr: transformExpressionPaths(item.expr, from, to),
      }))
      .with({ kind: "model-hook" }, (item) => ({
        ...item,
        namePath: transformNamePath(item.namePath, from, to),
      }))
      .with({ kind: "nested-select" }, (item) => {
        return {
          ...item,
          namePath: transformNamePath(item.namePath, from, to),
          select: transformSelectPath(item.select, from, to),
        };
      })
      .exhaustive();
  });
}

export function transformNamePath(path: string[], from: string[], to: string[]): string[] {
  ensureEqual(
    _.isEqual(from, _.take(path, from.length)),
    true,
    `Cannot transform name path: ${path.join(".")} doesn't start with ${from.join(".")}`
  );
  return [...to, ..._.drop(path, from.length)];
}

export function transformNamePaths(paths: string[][], from: string[], to: string[]): string[][] {
  return paths.map((path) => transformNamePath(path, from, to));
}

export function transformExpressionPaths(
  exp: TypedExprDef,
  from: string[],
  to: string[]
): TypedExprDef {
  if (exp === undefined) {
    return undefined;
  }
  switch (exp.kind) {
    case "literal":
    case "variable": {
      return exp;
    }
    case "alias": {
      return { ...exp, namePath: transformNamePath(exp.namePath, from, to) };
    }
    case "function": {
      return {
        ...exp,
        args: exp.args.map((arg) => transformExpressionPaths(arg, from, to)),
      };
    }
    case "aggregate-function": {
      return { ...exp, sourcePath: transformNamePath(exp.sourcePath, from, to) };
    }
    case "in-subquery": {
      return {
        ...exp,
        sourcePath: transformNamePath(exp.sourcePath, from, to),
        lookupExpression: transformExpressionPaths(exp, from, to),
      };
    }
    case "array": {
      return {
        ...exp,
        elements: exp.elements.map((arg) => transformExpressionPaths(arg, from, to)),
      };
    }
    default: {
      assertUnreachable(exp);
    }
  }
}
