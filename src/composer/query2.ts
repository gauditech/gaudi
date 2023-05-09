import _ from "lodash";

import { kindFind } from "@src/common/kindFilter";
import { ensureEmpty, ensureExists } from "@src/common/utils";
import * as AST from "@src/compiler/ast/ast";
import { getTypeModel } from "@src/compiler/ast/type";
import { processSelect } from "@src/composer/entrypoints2";
import { getTypedLiteralValue2 } from "@src/composer/utils";
import { queryFromParts2 } from "@src/runtime/query/build";
import {
  AggregateDef,
  FunctionName,
  ModelDef,
  QueryDef,
  QueryOrderByAtomDef,
  TypedExprDef,
} from "@src/types/definition";

export function composeQuery(
  models: AST.Model[],
  mdef: ModelDef,
  query: AST.Query | AST.AnonymousQuery
): QueryDef {
  ensureEmpty(kindFind(query.atoms, "aggregate"));

  const from = kindFind(query.atoms, "from");

  const sourceModel = mdef.name;
  const targetModel = getTypeModel(from?.identifierPath.at(-1)?.type) ?? sourceModel;
  const fromPath = [sourceModel, ...(from?.identifierPath.map((i) => i.identifier.text) ?? [])];

  const filterExpr = kindFind(query.atoms, "filter")?.expr;
  const filter = filterExpr && composeExpression(filterExpr, fromPath);

  const select = processSelect(
    models,
    targetModel,
    kindFind(query.atoms, "select")?.select,
    fromPath
  );

  const orderBy = kindFind(query.atoms, "orderBy")?.orderBy.map(
    ({ identifierPath, order }): QueryOrderByAtomDef => ({
      exp: {
        kind: "alias",
        namePath: [...fromPath, ...identifierPath.map((i) => i.identifier.text)],
      },
      direction: order ?? "asc",
    })
  );

  return queryFromParts2(
    targetModel,
    query.kind === "query" ? query.name.text : "",
    fromPath,
    filter,
    select,
    orderBy,
    kindFind(query.atoms, "limit")?.value.value,
    kindFind(query.atoms, "offset")?.value.value
  );
}

export function composeAggregate(
  models: AST.Model[],
  mdef: ModelDef,
  query: AST.Query | AST.AnonymousQuery
): AggregateDef {
  const aggregate = kindFind(query.atoms, "aggregate");
  ensureExists(aggregate);
  if (kindFind(query.atoms, "select")) {
    throw new Error(`Aggregate query can't have a select`);
  }
  const withoutAggregate = {
    ...query,
    atoms: query.atoms.filter(({ kind }) => kind !== "aggregate"),
  };
  const qdefWithoutAggregate = composeQuery(models, mdef, withoutAggregate);
  const { refKey } = qdefWithoutAggregate;
  const qdef = _.omit(qdefWithoutAggregate, ["refKey", "name", "select"]);

  // TODO add sum
  if (aggregate.aggregate !== "count") {
    throw new Error(`Unknown aggregate function ${aggregate}`);
  }

  return {
    refKey,
    kind: "aggregate",
    aggrFnName: aggregate.aggregate,
    targetPath: [mdef.refKey, "id"],
    name: query.kind === "query" ? query.name.text : "",
    query: qdef,
  };
}

function typedFunctionFromParts(name: string, args: AST.Expr[], namePath: string[]): TypedExprDef {
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

export function composeExpression(expr: AST.Expr, namePath: string[]): TypedExprDef {
  switch (expr.kind) {
    case "binary": {
      return typedFunctionFromParts(expr.operator, [expr.lhs, expr.rhs], namePath);
    }
    case "group": {
      return composeExpression(expr.expr, namePath);
    }
    case "unary": {
      // we assume operator is "not" as it is the only unary operator for now
      const nullLiteral: AST.Expr = {
        kind: "literal",
        literal: { kind: "null", value: null, token: { start: 0, end: 0 } },
        sourcePos: { start: 0, end: 0 },
        type: { kind: "primitive", primitiveKind: "null" },
      };
      return typedFunctionFromParts("is not", [expr.expr, nullLiteral], namePath);
    }
    case "path": {
      return composeRefPath(expr.path, namePath);
    }
    case "literal": {
      return getTypedLiteralValue2(expr.literal);
    }
    case "function": {
      return typedFunctionFromParts(expr.name.text, expr.args, namePath);
    }
  }
}

export function composeRefPath(
  path: AST.IdentifierRef[],
  namePath: string[]
): { kind: "alias"; namePath: string[] } | { kind: "variable"; name: string } {
  const [head, ...tail] = path;
  switch (head.ref.kind) {
    case "model":
      return {
        kind: "alias",
        namePath: [...namePath, ...tail.map((i) => i.identifier.text)],
      };
    case "modelAtom":
      return {
        kind: "alias",
        namePath: [...namePath, head.ref.name, ...tail.map((i) => i.identifier.text)],
      };
    case "queryTarget":
      return {
        kind: "alias",
        namePath: [...head.ref.path, ...tail.map((i) => i.identifier.text)],
      };
    case "context":
      switch (head.ref.contextKind) {
        case "virtualInput":
          return {
            kind: "variable",
            name: `___changeset___${path.map((i) => i.identifier.text).join("___")}`,
          };
        case "authToken":
          return { kind: "variable", name: `___requestAuthToken` };
        case "repeat":
          throw new Error("TODO");
        default:
          return { kind: "alias", namePath: path.map((i) => i.identifier.text) };
      }
    default:
      throw new Error("Unexpected unresolved reference");
  }
}
