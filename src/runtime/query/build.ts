import _ from "lodash";

import { mkJoinConnection } from "./stringify";

import { getModelProp, getRef, getRef2, getTargetModel } from "@src/common/refs";
import { ensureEqual } from "@src/common/utils";
import {
  DeepSelectItem,
  Definition,
  FilterDef,
  ModelDef,
  QueryDef,
  QueryDefPath,
  SelectDef,
  SelectHookItem,
  SelectItem,
  SelectableItem,
} from "@src/types/definition";
import { HookCode } from "@src/types/specification";

// FIXME introduce Queryable with SelectableItem[]?
export type QueryTree = {
  name: string;
  alias: string;
  query: QueryDef;
  hooks: {
    name: string;
    args: { name: string; query: QueryTree }[];
    code: HookCode;
  }[];
  related: QueryTree[];
};

export type NamePath = string[];

/**
 * Utils
 */

export function mergePaths(paths: NamePath[]): NamePath[] {
  return _.uniqWith(paths, _.isEqual);
}

export function selectToSelectable(select: SelectDef): SelectableItem[] {
  return select.filter((s): s is SelectableItem => s.kind === "field");
}

export function selectToHooks(select: SelectDef): SelectHookItem[] {
  return select.filter((s): s is SelectHookItem => s.kind === "hook");
}

export function applyFilterIdInContext(namePath: NamePath, filter?: FilterDef): FilterDef {
  const inFilter: FilterDef = {
    kind: "binary",
    operator: "in",
    lhs: { kind: "alias", namePath: [...namePath, "id"] },
    rhs: { kind: "variable", type: "list-integer", name: "@context_ids" },
  };
  return filter === undefined
    ? inFilter
    : {
        kind: "binary",
        operator: "and",
        lhs: filter,
        rhs: inFilter,
      };
}

function getPathRetType(def: Definition, path: NamePath): ModelDef {
  // assume it starts with model
  const { value: model } = getRef<"model">(def, path[0]);
  const ret = _.tail(path).reduce(
    (ctx, name) => getTargetModel(def.models, `${ctx.refKey}.${name}`),
    model
  );
  return ret;
}

export function selectableId(def: Definition, namePath: NamePath): SelectableItem {
  const model = getPathRetType(def, namePath);
  return {
    kind: "field",
    alias: "id",
    name: "id",
    namePath: [...namePath, "id"],
    refKey: `${model.refKey}.id`,
  };
}

/**
 * Query builder
 */

export function queryTreeFromParts(
  def: Definition,
  name: string,
  fromPath: NamePath,
  filter: FilterDef,
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
  filter: FilterDef,
  select: SelectDef
): QueryDef {
  if (select.length === 0) {
    return queryFromParts(def, name, fromPath, filter, [selectableId(def, fromPath)]);
  }
  select.forEach((selItem) => {
    if (selItem.alias === "__join_connection") {
      /* We currently make exception for `__join_connection` field as it's the only selectable
        not being in `fromPath`.
        Otherwise, we ensure that only the leaf of the `fromPath` can be selected,
        since we expect `retType` to match leaf model, we can't select from other (non-leaf) models.
       */
      return;
    }
    ensureEqual(
      _.isEqual(fromPath, _.initial(selItem.namePath)),
      true,
      `Path ${fromPath.join(".")} selects ${selItem.namePath.join(".")} as ${selItem.alias}`
    );
  });

  const filterPaths = getFilterPaths(filter);
  const paths = mergePaths([fromPath, ...filterPaths]);
  const direct = getDirectChildren(paths);
  ensureEqual(direct.length, 1);
  const { value: ctx } = getRef<"model">(def, direct[0]);
  const joinPaths = processPaths(def, getRelatedPaths(paths, ctx.name), ctx, [ctx.name]);

  return {
    refKey: "N/A",
    from: { kind: "model", refKey: ctx.refKey },
    filter,
    fromPath,
    name,
    nullable: false, // FIXME
    // retCardinality: "many", // FIXME,
    retType: getPathRetType(def, fromPath).refKey,
    select,
    joinPaths,
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

// function calculateCardinality(
//   ref: Ref<"reference" | "relation" | "query">,
//   paths: QueryDefPath[]
// ): "one" | "many" {
//   const joinsAllOnes = paths.every((p) => p.retCardinality === "one");
//   const isOne =
//     ref.kind === "reference" ||
//     (ref.kind === "relation" && ref.value.unique) ||
//     (ref.kind === "query" && ref.value.retCardinality === "one");
//   return isOne && joinsAllOnes ? "one" : "many";
// }

export function processPaths(
  def: Definition,
  paths: NamePath[],
  parentCtx: ModelDef,
  prefixNames: NamePath
): QueryDefPath[] {
  const direct = getDirectChildren(paths);
  return _.compact(
    direct.flatMap((name): QueryDefPath | null => {
      const relativeChildren = getRelatedPaths(paths, name);
      const ref = getModelProp<"field" | "reference" | "relation" | "query">(parentCtx, name);
      if (ref.kind === "field") {
        return null;
      }

      const targetCtx = getTargetModel(def.models, ref.value.refKey);
      const joinPaths = processPaths(def, relativeChildren, targetCtx, [...prefixNames, name]);
      return {
        kind: ref.kind,
        joinType: "inner",
        refKey: ref.value.refKey,
        name,
        namePath: [...prefixNames, name],
        joinPaths,
        retType: getTargetModel(def.models, ref.value.refKey).name,
        // retCardinality: calculateCardinality(ref, joinPaths),
      };
    })
  );
}

// function queryToString(def: Definition, q: QueryDef): string {}

export function getFilterPaths(filter: FilterDef): string[][] {
  switch (filter?.kind) {
    case undefined:
    case "literal":
    case "variable":
      return [];
    case "alias":
      return [[...filter.namePath]];
    case "binary": {
      return [...getFilterPaths(filter.lhs), ...getFilterPaths(filter.rhs)];
    }
  }
}

/**
 * QueryTree builder
 */

export function buildQueryTree(def: Definition, q: QueryDef): QueryTree {
  const query = { ...q, select: selectToSelectable(q.select) };
  const hooks = selectToHooks(q.select).map(({ name, args, code }) => ({
    name,
    args: args.map(({ name, query }) => {
      // apply a batching filter
      const filter = applyFilterIdInContext(query.fromPath, query.filter);
      // select the __join_connection
      const conn = mkJoinConnection(getRef2.model(def, _.first(query.fromPath)!));
      const select = [...query.select, conn];

      return {
        name,
        query: buildQueryTree(def, { ...query, filter, select }),
      };
    }),
    code,
  }));
  const { value: model } = getRef<"model">(def.models, query.retType);

  return {
    name: query.name,
    alias: query.name,
    query,
    hooks,
    related: queriesFromSelect(def, model, q.select).map((q) => buildQueryTree(def, q)),
  };
}

function queriesFromSelect(def: Definition, model: ModelDef, select: SelectDef): QueryDef[] {
  const deep: DeepSelectItem[] = select.filter(
    (s): s is DeepSelectItem =>
      s.kind === "reference" || s.kind === "relation" || s.kind === "query"
  );
  return deep.map((s) => selectToQuery(def, model, s));
}

function selectToQuery(def: Definition, model: ModelDef, select: DeepSelectItem): QueryDef {
  const namePath = [model.name, select.name];
  return queryFromParts(
    def,
    select.alias,
    namePath,
    applyFilterIdInContext([model.name], undefined),
    [
      ...select.select.map((s) => shiftSelect(model, s, select.namePath.length - 1)),
      mkJoinConnection(model),
    ]
  );
}

/**
 * Deprecated, use `transformSelectPath` instead!
 */
function shiftSelect(model: ModelDef, select: SelectItem, by: number): SelectItem {
  const namePath = [model.name, ...select.namePath.slice(by)];
  if (select.kind === "field" || select.kind === "hook") {
    return {
      ...select,
      namePath,
    };
  }
  return {
    ...select,
    namePath,
    select: select.select.map((s) => shiftSelect(model, s, by)),
  };
}

export function transformSelectPath(select: SelectDef, from: string[], to: string[]): SelectDef {
  return select.map((selItem: SelectItem) => {
    ensureEqual(
      _.isEqual(from, _.take(selItem.namePath, from.length)),
      true,
      `Cannot transform select: ${selItem.namePath.join(".")} doesn't start with ${from.join(".")}`
    );
    const newPath = [...to, ..._.drop(selItem.namePath, from.length)];
    switch (selItem.kind) {
      case "field":
      case "hook": {
        return { ...selItem, namePath: newPath };
      }
      case "query":
      case "reference":
      case "relation": {
        return {
          ...selItem,
          namePath: newPath,
          select: transformSelectPath(selItem.select, from, to),
        };
      }
    }
  });
}
