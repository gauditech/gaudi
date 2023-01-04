import _ from "lodash";

import { mkJoinConnection } from "./stringify";

import { getRef, getTargetModel } from "@src/common/refs";
import { assertUnreachable, ensureEqual } from "@src/common/utils";
import {
  DeepSelectItem,
  Definition,
  ModelDef,
  QueryDef,
  SelectDef,
  SelectHookItem,
  SelectItem,
  SelectableItem,
  TypedExprDef,
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

export function uniqueNamePaths(paths: NamePath[]): NamePath[] {
  return _.uniqWith(paths, _.isEqual);
}

export function selectToSelectable(select: SelectDef): SelectableItem[] {
  return select.filter(
    (s): s is SelectableItem =>
      s.kind === "field" || s.kind === "computed" || s.kind === "aggregate"
  );
}

export function selectToHooks(select: SelectDef): SelectHookItem[] {
  return select.filter((s): s is SelectHookItem => s.kind === "model-hook");
}

export function applyFilterIdInContext(namePath: NamePath, filter?: TypedExprDef): TypedExprDef {
  const inFilter: TypedExprDef = {
    kind: "function",
    name: "in",
    args: [
      { kind: "alias", namePath: [...namePath, "id"] },
      { kind: "variable", type: { type: "list-integer", nullable: false }, name: "@context_ids" },
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

  const sourceModel = getRef.model(def, _.first(fromPath)!);

  const filterPaths = getFilterPaths(filter);
  const paths = uniqueNamePaths([fromPath, ...filterPaths]);
  const direct = getDirectChildren(paths);
  ensureEqual(direct.length, 1);

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

export function getFilterPaths(filter: TypedExprDef): string[][] {
  switch (filter?.kind) {
    case undefined:
    case "literal":
    case "variable":
      return [];
    case "alias": {
      return [[...filter.namePath]];
    }
    case "function": {
      return filter.args.flatMap((arg) => getFilterPaths(arg));
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
    args: args.map(({ name, query }) => ({ name, query: buildQueryTree(def, query) })),
    code,
  }));
  const model = getRef.model(def, query.retType);

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
      ...transformSelectPath(select.select, _.initial(select.namePath), [model.name]),
      mkJoinConnection(model),
    ]
  );
}

export function transformSelectPath(select: SelectDef, from: string[], to: string[]): SelectDef {
  return select.map(<T extends SelectItem>(selItem: T): T => {
    const newPath = transformNamePath(selItem.namePath, from, to);
    switch (selItem.kind) {
      case "field":
      case "computed":
      case "model-hook": {
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
      case "aggregate": {
        return { ...selItem, namePath: newPath };
      }
      default: {
        assertUnreachable(selItem);
      }
    }
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
    default: {
      assertUnreachable(exp);
    }
  }
}
