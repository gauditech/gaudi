import _ from "lodash";
import { match } from "ts-pattern";

import { kindFilter } from "@src/common/kindFilter";
import { getRef, getTargetModel } from "@src/common/refs";
import { assertUnreachable, ensureEqual } from "@src/common/utils";
import { HookCode } from "@src/types/common";
import {
  Definition,
  ModelDef,
  NestedSelect,
  QueryDef,
  QueryOrderByAtomDef,
  SelectDef,
  SelectHook,
  SelectItem,
  SelectableExpression,
  TypedExprDef,
} from "@src/types/definition";

// FIXME introduce Queryable with SelectableItem[]?
export type QueryTree = {
  name: string;
  alias: string;
  query: QueryDef;
  queryIdAlias: string | undefined;
  hooks: {
    name: string;
    args: { name: string; query: QueryTree }[];
    hook: HookCode;
  }[];
  related: QueryTree[];
};

export type NamePath = string[];

export const GAUDI_INTERNAL_TARGET_ID_ALIAS = "__gaudi__target_id";

/**
 * Utils
 */

/**
 * TODO turn this into Queryable
 *
 * Converts QueryDef into a QueryDef with only selectable expressions.
 * Ensures the `id` field is selected any non-selectable item is requeste.d
 */
function queryToQueriable(query: QueryDef): QueryDef {
  const selectables = kindFilter(query.select, "expression");
  const targetIdAlias = findTargetIdAlias(query);
  if (targetIdAlias === GAUDI_INTERNAL_TARGET_ID_ALIAS) {
    selectables.push({
      kind: "expression",
      alias: GAUDI_INTERNAL_TARGET_ID_ALIAS,
      expr: { kind: "alias", namePath: [...query.fromPath, "id"] },
      type: { kind: "integer", nullable: false },
    });
  }

  return { ...query, select: selectables };
}

function findTargetIdAlias(query: QueryDef): string | undefined {
  const selectables = kindFilter(query.select, "expression");
  const hasNested = kindFilter(query.select, "nested-select");
  const hasHooks = kindFilter(query.select, "model-hook");
  const id = selectables.find(
    (s) =>
      s.alias === "id" &&
      s.expr?.kind === "alias" &&
      _.isEqual(s.expr.namePath, [...query.fromPath, "id"])
  );
  if (id) {
    return "id";
  } else if (hasHooks || hasNested) {
    return GAUDI_INTERNAL_TARGET_ID_ALIAS;
  }
}

export function selectToHooks(select: SelectDef): SelectHook[] {
  return select.filter((s): s is SelectHook => s.kind === "model-hook");
}

export function applyFilterIdInContext(namePath: NamePath, filter?: TypedExprDef): TypedExprDef {
  const inFilter: TypedExprDef = {
    kind: "function",
    name: "in",
    args: [
      { kind: "alias", namePath: [...namePath, "id"] },
      {
        kind: "variable",
        type: { kind: "collection", type: { kind: "integer", nullable: false } },
        name: "@context_ids",
      },
    ],
  };
  return filter === undefined
    ? inFilter
    : { kind: "function", name: "and", args: [filter, inFilter] };
}

function getPathRetType(def: Definition, path: NamePath): ModelDef {
  // assume it starts with model
  const model = getRef.model(def, path[0]);
  const ret = _.tail(path).reduce(
    (ctx, name) => getTargetModel(def, `${ctx.refKey}.${name}`),
    model
  );
  return ret;
}

/**
 * Query builder
 */

export function queryTreeFromParts(
  def: Definition,
  name: string,
  fromPath: NamePath,
  filter: TypedExprDef,
  select: SelectDef
): QueryTree {
  const query = queryFromParts(def, name, fromPath, filter, select);
  const qTree = buildQueryTree(def, query);
  return qTree;
}

export function queryFromParts(
  def: Definition,
  name: string,
  fromPath: NamePath,
  filter: TypedExprDef,
  select: SelectDef,
  orderBy?: QueryOrderByAtomDef[],
  limit?: number,
  offset?: number
): QueryDef {
  const sourceModel = getRef.model(def, _.first(fromPath)!);

  return {
    kind: "query",
    refKey: "N/A",
    modelRefKey: sourceModel.refKey,
    filter,
    fromPath,
    name,
    // retCardinality: "many", // FIXME,
    retType: getPathRetType(def, fromPath).refKey,
    select,
    orderBy,
    limit,
    offset,
  };
}

export function getDirectChildren(paths: NamePath[]): string[] {
  return _.chain(paths)
    .map((p) => p[0])
    .compact()
    .uniq()
    .value();
}

export function getRelatedPaths(paths: NamePath[], direct: string): NamePath[] {
  return paths.filter((path) => path[0] === direct).map(_.tail);
}

/**
 * QueryTree builder
 */

export function buildQueryTree(def: Definition, q: QueryDef): QueryTree {
  const query = queryToQueriable(q);
  const hooks = selectToHooks(q.select).map(({ name, refKey }) => {
    const modelHook = getRef.modelHook(def, refKey);
    return {
      name,
      args: modelHook.args.map(({ name, query }) => {
        // apply a batching filter
        const filter = applyFilterIdInContext(query.fromPath, query.filter);
        // select the __join_connection
        const conn = mkJoinConnection(getRef.model(def, _.first(query.fromPath)!));
        const select = [...query.select, conn];

        return {
          name,
          query: buildQueryTree(def, { ...query, filter, select }),
        };
      }),
      hook: modelHook.hook,
    };
  });
  const model = getRef.model(def, query.retType);

  return {
    name: query.name,
    alias: query.name,
    query,
    queryIdAlias: findTargetIdAlias(q),
    hooks,
    related: queriesFromSelect(def, model, q.select).map((q) => buildQueryTree(def, q)),
  };
}

function queriesFromSelect(def: Definition, model: ModelDef, select: SelectDef): QueryDef[] {
  const deep: NestedSelect[] = kindFilter(select, "nested-select");
  return deep.map((s) => selectToQuery(def, model, s));
}

function selectToQuery(def: Definition, model: ModelDef, select: NestedSelect): QueryDef {
  const ref = getRef(def, select.refKey);
  const namePath = [model.name, ref.name];
  return queryFromParts(
    def,
    select.alias,
    namePath,
    applyFilterIdInContext([model.name], undefined),
    [
      ...transformSelectPath(select.select, _.initial(select.namePath), [model.name]),
      mkJoinConnection(model),
    ]
  );
}

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

function mkJoinConnection(model: ModelDef): SelectableExpression {
  return {
    kind: "expression",
    alias: "__join_connection",
    expr: { kind: "alias", namePath: [model.name, "id"] },
    type: { kind: "integer", nullable: false },
  };
}

export function selectableId(namePath: NamePath): SelectableExpression {
  return {
    kind: "expression",
    alias: GAUDI_INTERNAL_TARGET_ID_ALIAS,
    expr: { kind: "alias", namePath: [...namePath, "id"] },
    type: { kind: "integer", nullable: false },
  };
}
