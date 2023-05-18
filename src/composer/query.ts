import _ from "lodash";

import { processSelect } from "@src/composer/entrypoints";
import { getTypedLiteralValue } from "@src/composer/utils";
import {
  AggregateDef,
  FunctionName,
  QueryDef,
  QueryOrderByAtomDef,
  TypedExprDef,
} from "@src/types/definition";
import * as Spec from "@src/types/specification";

export function composeQuery(qspec: Spec.Query): QueryDef {
  if (qspec.aggregate) {
    throw new Error(`Can't build a QueryDef when QuerySpec contains an aggregate`);
  }

  const fromPath = qspec.from.map((i) => i.text);

  const filter = qspec.filter && composeExpression(qspec.filter, fromPath);

  const select = processSelect(qspec.select, fromPath);
  if (select.length === 0) {
    select.push({
      kind: "field",
      alias: "id",
      name: "id",
      namePath: [...fromPath, "id"],
      refKey: `${qspec.sourceModel}.id`,
    });
  }

  const orderBy = qspec.orderBy?.map(
    ({ field, order }): QueryOrderByAtomDef => ({
      exp: { kind: "alias", namePath: [...fromPath, ...field] },
      direction: order ?? "asc",
    })
  );

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
      return typedFunctionFromParts(expr.name, expr.args, namePath);
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
    case "context":
      switch (head.ref.contextKind) {
        case "virtualInput":
          return {
            kind: "variable",
            name: `___changeset___${path.map((i) => i.text).join("___")}`,
          };
        case "authToken":
          return { kind: "variable", name: `___requestAuthToken` };
        case "repeat":
          throw new Error("TODO");
        default:
          return { kind: "alias", namePath: path.map((i) => i.text) };
      }
    default:
      throw new Error("Unexpected unresolved reference");
  }
}
