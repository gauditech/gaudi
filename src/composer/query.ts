import _ from "lodash";

import { getRef } from "@src/common/refs";
import { ensureEqual } from "@src/common/utils";
import { processSelect } from "@src/composer/entrypoints";
import {
  VarContext,
  getTypedChangesetContext,
  getTypedLiteralValue,
  getTypedPath,
} from "@src/composer/utils";
import {
  NamePath,
  getDirectChildren,
  getFilterPaths,
  queryFromParts,
  uniqueNamePaths,
} from "@src/runtime/query/build";
import {
  AggregateDef,
  Definition,
  FunctionName,
  ModelDef,
  QueryDef,
  QueryOrderByAtomDef,
  TypedExprDef,
} from "@src/types/definition";
import { ExpSpec, QuerySpec } from "@src/types/specification";

export function composeQuery(
  def: Definition,
  mdef: ModelDef,
  qspec: QuerySpec,
  ctx: VarContext
): QueryDef {
  if (qspec.aggregate) {
    throw new Error(`Can't build a QueryDef when QuerySpec contains an aggregate`);
  }

  if (qspec.fromAlias) {
    ensureEqual(
      (qspec.fromAlias ?? []).length,
      qspec.fromModel.length,
      `alias ${qspec.fromAlias} should be the same length as from ${qspec.fromModel}`
    );
  }

  const pathPrefix = _.first(qspec.fromModel);
  let fromPath = qspec.fromModel;
  if (pathPrefix !== mdef.name) {
    // path is not already prefixed with model name so we should do it
    fromPath = [mdef.name, ...qspec.fromModel];
  }

  /**
   *  For each alias in qspec, assign a NamePath. For example,
   * `from repos.issues as r.i` produces the following `aliases`:
   * { r: ["Org", "repos"], i: ["Org", "repos", "issues"] }
   */
  const aliases = (qspec.fromAlias ?? []).reduce((acc, curr, index) => {
    return _.assign(acc, { [curr]: _.take(fromPath, index + 2) });
  }, {} as Record<string, NamePath>);

  const filter = qspec.filter && composeExpression(def, qspec.filter, fromPath, ctx, aliases);

  const filterPaths = getFilterPaths(filter);
  const paths = uniqueNamePaths([fromPath, ...filterPaths]);
  const direct = getDirectChildren(paths);
  ensureEqual(direct.length, 1);
  const targetModel = getRef.model(def, direct[0]);
  const select = processSelect(def, targetModel, qspec.select, fromPath);

  const orderBy = qspec.orderBy?.map(
    ({ field, order }): QueryOrderByAtomDef => ({
      exp: { kind: "alias", namePath: [...fromPath, ...field] },
      direction: order ?? "asc",
    })
  );

  return queryFromParts(
    def,
    qspec.name,
    fromPath,
    filter,
    select,
    orderBy,
    qspec.limit,
    qspec.offset
  );
}

export function composeAggregate(def: Definition, mdef: ModelDef, qspec: QuerySpec): AggregateDef {
  const aggregate = qspec.aggregate?.name;
  if (!aggregate) {
    throw new Error(`Can't build an AggregateDef when QuerySpec doesn't contain an aggregate`);
  }
  if (qspec.select) {
    throw new Error(`Aggregate query can't have a select`);
  }
  const qdef = composeQuery(def, mdef, { ...qspec, aggregate: undefined }, {});
  const { refKey } = qdef;
  const query = _.omit(qdef, ["refKey", "name", "select"]);

  if (aggregate !== "sum" && aggregate !== "count") {
    throw new Error(`Unknown aggregate function ${aggregate}`);
  }

  return {
    refKey,
    kind: "aggregate",
    aggrFnName: aggregate,
    targetPath: [mdef.refKey, "id"],
    name: qspec.name,
    query,
  };
}

function typedFunctionFromParts(
  def: Definition,
  name: string,
  args: ExpSpec[],
  namespace: string[],
  context: VarContext = {},
  aliases: Record<string, NamePath> = {}
): TypedExprDef {
  return {
    kind: "function",
    name: name as FunctionName, // FIXME proper validation
    args: args.map((arg) => composeExpression(def, arg, namespace, context, aliases)),
  };
}

export function composeExpression(
  def: Definition,
  exp: ExpSpec,
  namespace: string[],
  context: VarContext = {},
  aliases: Record<string, NamePath> = {}
): TypedExprDef {
  switch (exp.kind) {
    case "literal": {
      return getTypedLiteralValue(exp.literal);
    }
    case "identifier": {
      // Check if identifier is from the changeset. This takes precedence over other stuff.

      try {
        getTypedChangesetContext(["@changeset", ...exp.identifier], context);
        return { kind: "variable", name: `___changeset___${exp.identifier.join("___")}` };
      } catch {
        const kind = context[exp.identifier[0]]?.kind;
        switch (kind) {
          case "iterator": {
            throw new Error("TODO");
          }
          case "requestAuthToken": {
            return { kind: "variable", name: `___requestAuthToken` };
          }
          default: {
            const expandedNamePath =
              exp.identifier[0] in aliases
                ? [...aliases[exp.identifier[0]], ..._.tail(exp.identifier)]
                : [...namespace, ...exp.identifier];
            getTypedPath(def, expandedNamePath, context);
            return { kind: "alias", namePath: expandedNamePath };
          }
        }
      }
    }
    // everything else composes to a function
    case "unary": {
      return typedFunctionFromParts(
        def,
        "not",
        [exp.exp, { kind: "literal", literal: true }],
        namespace,
        context,
        aliases
      );
    }
    case "binary": {
      return typedFunctionFromParts(
        def,
        exp.operator,
        [exp.lhs, exp.rhs],
        namespace,
        context,
        aliases
      );
    }
    case "function": {
      return typedFunctionFromParts(def, exp.name, exp.args, namespace, context, aliases);
    }
  }
}
