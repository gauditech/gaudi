import { kindFilter } from "@gaudi/compiler/dist/common/kindFilter";
import { transformSelectPath } from "@gaudi/compiler/dist/common/query";
import { getRef, getTargetModel } from "@gaudi/compiler/dist/common/refs";
import { HookCode } from "@gaudi/compiler/dist/types/common";
import {
  Definition,
  ModelDef,
  NestedSelect,
  QueryDef,
  QueryOrderByAtomDef,
  SelectDef,
  SelectHook,
  SelectableExpression,
  TypedExprDef,
} from "@gaudi/compiler/dist/types/definition";
import _ from "lodash";
import { match } from "ts-pattern";

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
      expr: { kind: "identifier-path", namePath: [...query.fromPath, "id"] },
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
      s.expr?.kind === "identifier-path" &&
      _.isEqual(s.expr.namePath, [...query.fromPath, "id"])
  );
  if (id) {
    return "id";
  } else if (hasHooks || hasNested) {
    return GAUDI_INTERNAL_TARGET_ID_ALIAS;
  }
}

export function selectToHooks(select: SelectDef): SelectHook[] {
  return kindFilter(select, "model-hook");
}

export function applyFilterIdInContext(namePath: NamePath, filter?: TypedExprDef): TypedExprDef {
  const inFilter: TypedExprDef = {
    kind: "function",
    name: "in",
    args: [
      { kind: "identifier-path", namePath: [...namePath, "id"] },
      {
        kind: "alias-reference",
        type: { kind: "collection", type: { kind: "integer", nullable: false } },
        path: ["@context_ids"],
        source: undefined,
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
    retCardinality: "collection",
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
  const ref = getRef(def, select.refKey, undefined, ["reference", "relation", "query"]);
  const namePath = [model.name, ref.name];
  const query = queryFromParts(
    def,
    select.alias,
    namePath,
    applyFilterIdInContext([model.name], undefined),
    [
      ...transformSelectPath(select.select, _.initial(select.namePath), [model.name]),
      mkJoinConnection(model),
    ]
  );

  query.retCardinality = match(ref)
    .with({ kind: "reference" }, ({ nullable }) => (nullable ? "nullable" : "one"))
    .with({ kind: "relation" }, ({ unique }) => (unique ? "nullable" : "collection"))
    .with({ kind: "query" }, ({ retCardinality }) => retCardinality)
    .exhaustive();

  return query;
}

function mkJoinConnection(model: ModelDef): SelectableExpression {
  return {
    kind: "expression",
    alias: "__join_connection",
    expr: { kind: "identifier-path", namePath: [model.name, "id"] },
    type: { kind: "integer", nullable: false },
  };
}

export function selectableId(namePath: NamePath): SelectableExpression {
  return {
    kind: "expression",
    alias: GAUDI_INTERNAL_TARGET_ID_ALIAS,
    expr: { kind: "identifier-path", namePath: [...namePath, "id"] },
    type: { kind: "integer", nullable: false },
  };
}
