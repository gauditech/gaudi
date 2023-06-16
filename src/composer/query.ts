import _ from "lodash";
import { match } from "ts-pattern";

import { defineType } from "./models";

import {
  UnreachableError,
  assertUnreachable,
  ensureEqual,
  shouldBeUnreachableCb,
} from "@src/common/utils";
import { Type } from "@src/compiler/ast/type";
import { refKeyFromRef } from "@src/composer/utils";
import {
  AggregateDef,
  FunctionName,
  QueryDef,
  QueryOrderByAtomDef,
  SelectDef,
  SelectItem,
  TypedExprDef,
} from "@src/types/definition";
import * as Spec from "@src/types/specification";

export function composeQuery(qspec: Spec.Query): QueryDef {
  if (qspec.aggregate && qspec.aggregate !== "first" && qspec.aggregate !== "one") {
    throw new Error(`Can't build a QueryDef when QuerySpec contains an aggregate`);
  }

  const fromPath = qspec.from.map((i) => i.text);

  const filter = qspec.filter && composeExpression(qspec.filter, fromPath);

  const select = composeSelect(qspec.select, fromPath);

  const orderBy = composeOrderBy(fromPath, qspec.orderBy);

  return {
    kind: "query",
    refKey: "N/A",
    modelRefKey: qspec.sourceModel,
    filter,
    fromPath,
    name: qspec.name,
    retCardinality: qspec.cardinality,
    retType: qspec.targetModel,
    select,
    orderBy,
    limit: qspec.aggregate ? 1 : qspec.limit,
    offset: qspec.offset,
  };
}

export function composeAggregate(qspec: Spec.Query): AggregateDef {
  const aggregate = qspec.aggregate;
  if (!aggregate) {
    throw new Error(`Can't build an AggregateDef when QuerySpec doesn't contain an aggregate`);
  }
  const qdef = composeQuery({ ...qspec, aggregate: undefined });
  const { refKey } = qdef;
  const query = _.omit(qdef, ["refKey", "name", "select"]);

  if (aggregate !== "sum" && aggregate !== "count") {
    throw new Error(`Unknown aggregate function ${aggregate}`);
  }

  return {
    refKey,
    kind: "aggregate",
    aggrFnName: aggregate,
    targetPath: [qspec.sourceModel, "id"],
    name: qspec.name,
    query,
  };
}

export function composeOrderBy(
  fromPath: string[],
  orderBy: Spec.QueryOrderBy[] | undefined
): QueryOrderByAtomDef[] | undefined {
  if (orderBy == null) return;

  return orderBy?.map(
    ({ expr, order }): QueryOrderByAtomDef => ({
      exp: composeExpression(expr, fromPath),
      direction: order ?? "asc",
    })
  );
}
function typedFunctionFromParts(name: string, args: Spec.Expr[], namePath: string[]): TypedExprDef {
  // Change name to concat if using "+" with "string" type
  const firstType = args.at(0)?.type;
  if (name === "+" && firstType?.kind === "primitive" && firstType.primitiveKind === "string") {
    name = "concat";
  }

  return {
    kind: "function",
    name: name as FunctionName, // FIXME proper validation
    args: args.map((arg) => composeExpression(arg, namePath)),
  };
}

export function composeExpression(expr: Spec.Expr, namePath: string[]): TypedExprDef {
  switch (expr.kind) {
    case "identifier": {
      return composeRefPath(expr.identifier, namePath);
    }
    case "literal": {
      return { kind: "literal", literal: expr.literal };
    }
    case "function": {
      switch (expr.name) {
        case "sum":
        case "count": {
          const arg = expr.args[0];
          ensureEqual(arg.kind, "identifier");
          const [head, ...tail] = arg.identifier;
          const [sourcePath, targetPath] = match(head.ref)
            .with({ kind: "modelAtom" }, () => {
              return [namePath, arg.identifier.map((i) => i.text)];
            })
            .with({ kind: "queryTarget" }, (ref) => {
              return [ref.path, tail.map((i) => i.text)];
            })
            .otherwise(() => {
              throw new UnreachableError(`Invalid ref kind ${head.ref.kind}`);
            });

          return {
            kind: "aggregate-function",
            fnName: expr.name,
            type: defineType(expr.type),
            sourcePath,
            targetPath,
          };
        }
        case "in":
        case "not in": {
          const arg0 = expr.args[0];
          const lookupExpression = match<typeof arg0, TypedExprDef>(arg0)
            .with({ kind: "identifier" }, (arg) => {
              const [head, ...tail] = arg.identifier;
              return (
                match<typeof head.ref, TypedExprDef>(head.ref)
                  // FIXME literals should be supported before IN as well ?
                  .with({ kind: "modelAtom" }, () => ({
                    kind: "alias",
                    namePath: [...namePath, ...arg.identifier.map((i) => i.text)],
                  }))
                  .with({ kind: "queryTarget" }, (ref) => ({
                    kind: "alias",
                    namePath: [...ref.path, ...tail.map((i) => i.text)],
                  }))
                  // FIXME support context vars: auth, struct, target...
                  .otherwise(shouldBeUnreachableCb(`${head.ref.kind} is not a valid lookup`))
              );
            })
            .with({ kind: "literal" }, ({ literal }) => ({
              kind: "literal",
              literal,
            }))
            .with({ kind: "function" }, (fn) => typedFunctionFromParts(fn.name, fn.args, namePath))
            .with({ kind: "array" }, shouldBeUnreachableCb(`TODO`))
            .exhaustive();

          const arg1 = expr.args[1];
          return match<typeof arg1, TypedExprDef>(arg1)
            .with({ kind: "identifier" }, (arg) => {
              const [head1, ...tail1] = arg.identifier;
              const [sourcePath, targetPath] = match(head1.ref)
                .with({ kind: "modelAtom" }, () => {
                  return [namePath, arg.identifier.map((i) => i.text)];
                })
                .with({ kind: "queryTarget" }, (ref) => {
                  return [ref.path, tail1.map((i) => i.text)];
                })
                .otherwise(() => {
                  throw new UnreachableError(`Invalid ref kind ${head1.ref.kind}`);
                });

              return {
                kind: "in-subquery",
                fnName: expr.name as "in" | "not in",
                lookupExpression,
                sourcePath,
                targetPath,
              };
            })
            .with({ kind: "array" }, (arg) => {
              return {
                kind: "function",
                name: expr.name as "in" | "not in",
                args: [lookupExpression, composeExpression(arg, namePath)],
              };
            })
            .otherwise(
              shouldBeUnreachableCb(`Unexpected ${expr.name} argument kind: ${arg1.kind}`)
            );
        }
        default: {
          return typedFunctionFromParts(expr.name, expr.args, namePath);
        }
      }
    }
    case "array": {
      return {
        kind: "array",
        elements: expr.elements.map((e) => composeExpression(e, namePath)),
        type: {
          kind: "collection",
          type: defineType(expr.type.kind === "collection" ? expr.type.type : Type.any),
        },
      };
    }
    default:
      return assertUnreachable(expr);
  }
}

export function composeRefPath(
  path: Spec.IdentifierRef[],
  namePath: string[]
): { kind: "alias"; namePath: string[] } | { kind: "variable"; name: string } {
  const [head, ...tail] = path;
  switch (head.ref.kind) {
    case "model":
      return {
        kind: "alias",
        namePath: [...namePath, ...tail.map((i) => i.text)],
      };
    case "modelAtom":
      return {
        kind: "alias",
        namePath: [...namePath, ...path.map((i) => i.text)],
      };
    case "queryTarget":
      return {
        kind: "alias",
        namePath: [...head.ref.path, ...tail.map((i) => i.text)],
      };
    case "virtualInput":
      return {
        kind: "variable",
        name: `___changeset___${path.map((i) => i.text).join("___")}`,
      };
    case "target":
    case "action":
      return { kind: "alias", namePath: path.map((i) => i.text) };
    case "authToken":
      return { kind: "variable", name: `___requestAuthToken` };
    case "auth":
      return { kind: "alias", namePath: path.map((i) => i.text) };
    case "struct":
      throw new UnreachableError("Unexpected struct reference in first identifier");
    case "repeat":
      throw new Error("TODO");
  }
}

export function composeSelect(select: Spec.Select, parentNamePath: string[]): SelectDef {
  return select.map((select): SelectItem => {
    if (select.expr.kind === "identifier") {
      const last = select.expr.identifier.at(-1);
      if (last?.ref.kind === "modelAtom" && last.ref.atomKind === "hook") {
        return {
          kind: "model-hook",
          refKey: refKeyFromRef(last.ref),
          name: last.ref.name,
          alias: last.text,
          namePath: [...parentNamePath, ...select.expr.identifier.map((i) => i.text)],
        };
      }
    }
    if (select.kind === "nested") {
      ensureEqual(select.expr.kind, "identifier");
      const namePath = [...parentNamePath, ...select.expr.identifier.map((i) => i.text)];
      const last = select.expr.identifier.at(-1);
      if (last?.ref.kind !== "model") {
        ensureEqual(last?.ref.kind, "modelAtom");
      }
      return {
        kind: "nested-select",
        refKey: refKeyFromRef(last.ref),
        alias: select.name,
        namePath,
        select: composeSelect(select.select, namePath),
      };
    }
    const expr = composeExpression(select.expr, parentNamePath);
    return {
      kind: "expression",
      expr,
      alias: select.name,
      type: defineType(select.expr.type),
    };
  });
}
