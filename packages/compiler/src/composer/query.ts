import _ from "lodash";
import { P, match } from "ts-pattern";

import { compose } from "./composer";
import { defineType } from "./models";

import { UnreachableError, ensureEqual, shouldBeUnreachableCb } from "@compiler/common/utils";
import { Type } from "@compiler/compiler/ast/type";
import { refKeyFromRef } from "@compiler/composer/utils";
import {
  FunctionName,
  QueryDef,
  QueryOrderByAtomDef,
  SelectDef,
  SelectItem,
  TypedAliasReference,
  TypedExprDef,
  TypedIdentifierPath,
} from "@compiler/types/definition";
import * as Spec from "@compiler/types/specification";

export function composeQuery(qspec: Spec.Query): QueryDef {
  if (qspec.aggregate && qspec.aggregate !== "first" && qspec.aggregate !== "one") {
    throw new Error(`Can't build a QueryDef when QuerySpec contains an aggregate`);
  }

  const fromPath = qspec.from.map((i) => i.text);

  const filter = qspec.filter && composeExpression(qspec.filter, fromPath);

  const select = qspec.select ? composeSelect(qspec.select, fromPath) : [];

  const orderBy = composeOrderBy(fromPath, qspec.orderBy);

  return {
    kind: "query",
    refKey: "N/A",
    modelRefKey: qspec.sourceModel,
    filter,
    fromPath,
    name: qspec.name ?? "$query",
    retCardinality: qspec.cardinality,
    retType: qspec.targetModel,
    select,
    orderBy,
    limit: qspec.aggregate ? 1 : qspec.limit,
    offset: qspec.offset,
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
function typedFunctionFromParts(
  name: string,
  args: Spec.Expr<"db" | "code">[],
  namePath: string[]
): TypedExprDef {
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

export function composeExpression(
  expr: Spec.Expr<"code"> | undefined,
  namePath: string[]
): TypedExprDef {
  return match<typeof expr, TypedExprDef>(expr)
    .with(undefined, () => undefined)
    .with({ kind: "literal" }, ({ literal }) => ({
      kind: "literal",
      literal,
    }))
    .with({ kind: "identifier" }, ({ identifier }) => composeRefPath(identifier, namePath))
    .with({ kind: "array" }, (array) => ({
      kind: "array",
      elements: array.elements.map((e) => composeExpression(e, namePath)),
      type: {
        kind: "collection",
        type: defineType(array.type.kind === "collection" ? array.type.type : Type.any),
      },
    }))
    .with({ kind: "function" }, (fn) => {
      return match<typeof fn, TypedExprDef>(fn)
        .with({ name: P.union("sum" as const, "count" as const) }, (fn) => {
          const arg = fn.args[0];
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
            fnName: fn.name,
            type: defineType(fn.type),
            sourcePath,
            targetPath,
          };
        })
        .with({ name: P.union("in" as const, "not in" as const) }, (fn) => {
          const arg0 = fn.args[0];
          const lookupExpression = match<typeof arg0, TypedExprDef>(arg0)
            .with({ kind: "identifier" }, (arg) => {
              const [head, ...tail] = arg.identifier;
              return (
                match<typeof head.ref, TypedExprDef>(head.ref)
                  .with({ kind: "modelAtom" }, () => ({
                    kind: "identifier-path",
                    namePath: [...namePath, ...arg.identifier.map((i) => i.text)],
                  }))
                  .with({ kind: "queryTarget" }, (ref) => ({
                    kind: "identifier-path",
                    namePath: [...ref.path, ...tail.map((i) => i.text)],
                  }))
                  // FIXME support context vars: auth, struct, target...
                  .otherwise(shouldBeUnreachableCb(`${head.ref.kind} is not a valid lookup`))
              );
            })
            .with(
              { kind: "array" },
              shouldBeUnreachableCb('"array" is not a valid lookup expression')
            )
            .with(
              { kind: "hook" },
              shouldBeUnreachableCb("Hooks not implemented for 'in' / 'not in'")
            )
            .otherwise((exp) => composeExpression(exp, namePath));
          const arg1 = fn.args[1];
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
                fnName: fn.name,
                lookupExpression,
                sourcePath,
                targetPath,
              };
            })
            .with({ kind: "array" }, (arg) => {
              return {
                kind: "function",
                name: fn.name,
                args: [lookupExpression, composeExpression(arg, namePath)],
              };
            })
            .otherwise(shouldBeUnreachableCb(`Unexpected ${fn.name} argument kind: ${arg1.kind}`));
        })
        .otherwise((fn) => typedFunctionFromParts(fn.name, fn.args, namePath));
    })
    .with({ kind: "hook" }, ({ hook }) => {
      return {
        kind: "hook",
        hook: {
          args: hook.args.map((arg) => ({
            name: arg.name,
            setter: composeExpression(arg.expr, []),
            kind: "basic",
          })),
          hook: hook.code,
        },
      };
    })
    .exhaustive();
}

export function composeRefPath(
  path: Spec.IdentifierRef[],
  namePath: string[]
): TypedAliasReference | TypedIdentifierPath {
  const [head, ...tail] = path;
  switch (head.ref.kind) {
    case "model":
      return {
        kind: "identifier-path",
        namePath: [...namePath, ...tail.map((i) => i.text)],
      };
    case "validatorArg":
    case "modelAtom":
      return {
        kind: "identifier-path",
        namePath: [...namePath, ...path.map((i) => i.text)],
      };
    case "queryTarget":
      return {
        kind: "identifier-path",
        namePath: [...head.ref.path, ...tail.map((i) => i.text)],
      };
    case "extraInput":
      return {
        kind: "alias-reference",
        source: "fieldset",
        path: path.map((p) => p.text),
      };
    case "target":
    case "action":
    case "auth":
    case "repeat":
    case "authToken":
      return { kind: "alias-reference", path: path.map((i) => i.text), source: "alias" };
    case "struct":
      throw new UnreachableError("Unexpected struct reference in first identifier");
    case "validator":
      throw new UnreachableError("Unexpected validator reference in expression");
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
