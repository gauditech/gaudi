import { Expr, Ref } from "./ast";
import { Type } from "./type";

import { assertUnreachable } from "@src/common/utils";

export type Scope = {
  environment: "model" | "entrypoint";
  model: string | undefined;
  context: ScopeContext;
  typeGuard: TypeGuard;
};
type ScopeContext = { [P in string]?: { type: Type; ref: Ref } };

type TypeGuardOperation = "null" | "notNull";
// key is a path joined with '|'
type TypeGuard = { [P in string]?: TypeGuardOperation };

/**
 * Function that takes a boolean expression and creates new scope with more precise
 * types which assume that expression is `true`. This function only works if the `expr`
 * returns a boolean value.
 */
export function addTypeGuard(expr: Expr, scope: Scope, isInverse: boolean): Scope {
  const typeGuard = createTypeGuard(expr, isInverse);
  // when adding a new type guard we use union
  return { ...scope, typeGuard: { ...scope.typeGuard, ...typeGuard } };
}

function createTypeGuard(expr: Expr, isInverse: boolean): TypeGuard {
  switch (expr.kind) {
    case "binary": {
      switch (expr.operator) {
        case "is": {
          const lhsOperation = getTypeGuardOperation(expr.lhs.type);
          const rhsOperation = getTypeGuardOperation(expr.rhs.type);
          if (lhsOperation && !rhsOperation) {
            return createTypeGuardFromPath(expr.rhs, modifyGuardOperation(lhsOperation, isInverse));
          } else if (!lhsOperation && rhsOperation) {
            return createTypeGuardFromPath(expr.lhs, modifyGuardOperation(rhsOperation, isInverse));
          }
          return {};
        }
        case "is not": {
          const lhsOperation = getTypeGuardOperation(expr.lhs.type);
          const rhsOperation = getTypeGuardOperation(expr.rhs.type);
          // use !isInverse because we want double inversion for is not
          if (lhsOperation && !rhsOperation) {
            return createTypeGuardFromPath(
              expr.rhs,
              modifyGuardOperation(lhsOperation, !isInverse)
            );
          } else if (!lhsOperation && rhsOperation) {
            return createTypeGuardFromPath(
              expr.lhs,
              modifyGuardOperation(rhsOperation, !isInverse)
            );
          }
          return {};
        }
        case "and": {
          const lhsGuard = createTypeGuard(expr.lhs, isInverse);
          const rhsGuard = createTypeGuard(expr.rhs, isInverse);
          // return union of guards
          return { ...lhsGuard, ...rhsGuard };
        }
        case "or": {
          const lhsGuard = createTypeGuard(expr.lhs, isInverse);
          const rhsGuard = createTypeGuard(expr.rhs, isInverse);
          // return intersection of guards
          const intersection: TypeGuard = {};
          Object.keys(lhsGuard).forEach((key) => {
            if (lhsGuard[key] && rhsGuard[key] && lhsGuard[key] === rhsGuard[key]) {
              intersection[key] = lhsGuard[key];
            }
          });
          return intersection;
        }
        case "in": {
          const rhsOperation =
            expr.rhs.type.kind === "collection" && getTypeGuardOperation(expr.rhs.type.type);
          if (rhsOperation) {
            return createTypeGuardFromPath(expr.lhs, modifyGuardOperation(rhsOperation, isInverse));
          }
          return {};
        }
        case "not in": {
          const rhsOperation =
            expr.rhs.type.kind === "collection" && getTypeGuardOperation(expr.rhs.type.type);
          if (rhsOperation) {
            return createTypeGuardFromPath(
              expr.lhs,
              modifyGuardOperation(rhsOperation, !isInverse)
            );
          }
          return {};
        }
        default:
          return {};
      }
    }
    case "group":
      return createTypeGuard(expr.expr, isInverse);
    case "unary":
      if (expr.operator === "not") {
        return createTypeGuard(expr.expr, !isInverse);
      } else {
        return assertUnreachable(expr);
      }
    case "array":
    case "function":
    case "path":
    case "literal":
      // we are not smart enough to get a guard for a function
      // literal and path should be handled in a binary operation
      return {};
  }
}

function modifyGuardOperation(operation: TypeGuardOperation, isInverse: boolean) {
  return isInverse ? (operation === "null" ? "notNull" : "null") : operation;
}

function createTypeGuardFromPath(expr: Expr, guardOperation: TypeGuardOperation): TypeGuard {
  switch (expr.kind) {
    case "group":
      return createTypeGuardFromPath(expr.expr, guardOperation);
    case "path": {
      const result: TypeGuard = {};
      if (guardOperation === "notNull") {
        expr.path.forEach((identifier, i) => {
          if (identifier.type.kind !== "nullable") return;
          const path = expr.path
            .slice(0, i + 1)
            .map((i) => i.text)
            .join("|");
          result[path] = "notNull";
        });
      }
      if (guardOperation === "null" && expr.path.at(-1)?.type.kind === "nullable") {
        const path = expr.path.map((i) => i.text).join("|");
        result[path] = "null";
      }
      return result;
    }
    default:
      return {};
  }
}

function getTypeGuardOperation(type: Type): TypeGuardOperation | undefined {
  switch (type.kind) {
    case "any":
    case "nullable":
      return undefined;
    case "null":
      return "null";
    default:
      return "notNull";
  }
}
