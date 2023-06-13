import _ from "lodash";
import { match } from "ts-pattern";

import { defineType } from "./models";

import { UnreachableError, ensureEqual } from "@src/common/utils";
import { getTypedLiteralValue, refKeyFromRef } from "@src/composer/utils";
import {
  AggregateDef,
  FunctionName,
  QueryDef,
  QueryOrderByAtomDef,
  SelectDef,
  SelectItem,
  TypedExprDef,
  VariablePrimitiveType,
} from "@src/types/definition";
import * as Spec from "@src/types/specification";

export function composeQuery(qspec: Spec.Query): QueryDef {
  if (qspec.aggregate) {
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
    // retCardinality: "many", // FIXME,
    retType: qspec.targetModel,
    select,
    orderBy,
    limit: qspec.limit,
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
      return getTypedLiteralValue(expr.literal);
    }
    case "function": {
      switch (expr.name) {
        case "sum":
        case "count": {
          let nullable: boolean;
          let primitiveType;
          if (expr.type.kind === "nullable") {
            nullable = true;
            ensureEqual(expr.type.type.kind, "primitive");
            primitiveType = expr.type.type.primitiveKind;
          } else {
            nullable = false;
            ensureEqual(expr.type.kind, "primitive");
            primitiveType = expr.type.primitiveKind;
          }
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
            type: { kind: primitiveType as VariablePrimitiveType["kind"], nullable },
            sourcePath,
            targetPath,
          };
        }
        default: {
          return typedFunctionFromParts(expr.name, expr.args, namePath);
        }
      }
    }
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
