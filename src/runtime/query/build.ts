import _ from "lodash";

import { mkJoinConnection } from "./stringify";

import { getModelProp, getRef, getTargetModel } from "@src/common/refs";
import { ensureEqual } from "@src/common/utils";
import {
  DeepSelectItem,
  Definition,
  EndpointDef,
  FilterDef,
  ModelDef,
  QueryDef,
  QueryDefPath,
  SelectDef,
  SelectItem,
  SelectableItem,
  TargetDef,
} from "@src/types/definition";

// FIXME introduce Queryable with SelectableItem[]?
export type QueryTree = {
  name: string;
  alias: string;
  query: QueryDef;
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

/**
 * Endpoint query builder
 */

export type EndpointQueries = {
  parentContextQueryTrees: QueryTree[];
  targetQueryTree: QueryTree;
  responseQueryTree: QueryTree;
};

export function endpointQueries(def: Definition, endpoint: EndpointDef): EndpointQueries {
  const parentContextQueryTrees = endpoint.parentContext.map((target, index) => {
    const parentTarget = index === 0 ? null : endpoint.parentContext[index - 1];
    const namePath = parentTarget ? [parentTarget.retType, target.name] : [target.retType];
    // apply identifyWith filter
    const targetFilter = targetToFilter({ ...target, namePath });
    // apply filter from it's parent
    const filter = parentTarget
      ? applyFilterIdInContext([parentTarget.retType], targetFilter)
      : targetFilter;
    const query = queryFromParts(def, target.alias, namePath, filter, target.select);
    return buildQueryTree(def, query);
  });

  // repeat the same for target
  const e = endpoint; // just a better code formatting this way
  const parentTarget = _.last(e.parentContext);
  const namePath = parentTarget ? [parentTarget.retType, e.target.name] : [e.target.retType];

  const targetFilter =
    e.kind === "create" || e.kind === "list"
      ? undefined
      : targetToFilter({ ...e.target, namePath });

  const filter = parentTarget
    ? applyFilterIdInContext([parentTarget.retType], targetFilter)
    : targetFilter;
  const targetQuery = queryFromParts(def, e.target.alias, namePath, filter, e.target.select);
  const targetQueryTree = buildQueryTree(def, targetQuery);

  const responseQuery = queryFromParts(def, e.target.alias, namePath, filter, e.response ?? []);
  const responseQueryTree = buildQueryTree(def, responseQuery);
  return { parentContextQueryTrees, targetQueryTree, responseQueryTree };
}

function applyFilterIdInContext(namePath: NamePath, filter: FilterDef): FilterDef {
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
  const filterPaths = getFilterPaths(filter);
  const paths = mergePaths([fromPath, ...filterPaths]);
  const direct = getDirectChildren(paths);
  ensureEqual(direct.length, 1);
  const { value: ctx } = getRef<"model">(def, direct[0]);
  const joinPaths = processPaths(def, getRelatedPaths(paths, ctx.name), ctx, [ctx.name]);

  return {
    refKey: "N/A",
    from: { kind: "model", refKey: fromPath[0] },
    filter,
    fromPath,
    name,
    nullable: false,
    // retCardinality: "many", // FIXME,
    retType: getPathRetType(def, fromPath).refKey,
    select,
    joinPaths,
  };
}

function targetToFilter(target: TargetDef): FilterDef {
  return {
    kind: "binary",
    operator: "is",
    lhs: { kind: "alias", namePath: [...target.namePath, target.identifyWith.name] },
    rhs: {
      kind: "variable",
      type: target.identifyWith.type,
      name: target.identifyWith.paramName,
    },
  };
}

export function filterFromTargets(targets: TargetDef[]): FilterDef {
  if (!targets.length) {
    return undefined;
  }
  const [t, ...rest] = targets;
  const f = targetToFilter(t);
  if (rest.length === 0) {
    return f;
  }

  return {
    kind: "binary",
    operator: "and",
    lhs: f,
    rhs: filterFromTargets(rest),
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
  const { value: model } = getRef<"model">(def.models, query.retType);

  return {
    name: query.name,
    alias: query.name,
    query,
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

function shiftSelect(model: ModelDef, select: SelectItem, by: number): SelectItem {
  const namePath = [model.name, ...select.namePath.slice(by)];
  if (select.kind === "field") {
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
