import _ from "lodash";

import { Ref, getModelProp, getRef, getTargetModel } from "@src/common/refs";
import { ensureEqual } from "@src/common/utils";
import {
  Definition,
  EndpointDef,
  FilterDef,
  ModelDef,
  QueryDef,
  QueryDefPath,
  SelectDef,
  SelectableItem,
  TargetDef,
} from "@src/types/definition";

type NamePath = string[];

// FIXME add tests
export function mergePaths(paths: NamePath[]): NamePath[] {
  return _.uniqWith(paths, _.isEqual);
}

export function selectToSelectable(select: SelectDef): SelectableItem[] {
  return select.filter((s): s is SelectableItem => s.kind === "field" || s.kind === "constant");
}

export function mkTargetQuery(def: Definition, endpoint: EndpointDef): QueryDef {
  const targets = endpoint.targets;
  switch (endpoint.kind) {
    case "list":
    case "create": {
      //  without the final filter
      return null as unknown as QueryDef; // FIXME
    }
    case "get":
    case "delete":
    case "update": {
      // fetch with all the filters
      return mkContextQuery(def, targets, selectToSelectable(endpoint.response ?? []))!;
    }
  }
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

export function mkContextQuery(
  def: Definition,
  targets: TargetDef[],
  select: SelectableItem[]
): QueryDef | null {
  // this is context query, drop final target
  if (!targets.length) return null;
  const targetPath = targets.map((t) => t.name);
  const filterPaths = targets.flatMap((t) => getFilterPaths(targetToFilter(t)));
  const paths = mergePaths([targetPath, ...filterPaths]);
  const direct = getDirectChildren(paths);
  ensureEqual(direct.length, 1);
  const { value: ctx } = getRef<"model">(def, direct[0]);
  const joinPaths = processPaths(def, getRelatedPaths(paths, ctx.name), ctx, [ctx.name]);
  // navigate through targets to find cardinality
  const [isOne, nullable] = _.tail(targets).reduce(
    (a, t) => {
      const ref = getRef<"reference" | "relation" | "query">(def, `${ctx.name}.${t.name}`);
      switch (ref.kind) {
        case "reference": {
          return [a[0], a[1] || ref.value.nullable];
        }
        case "relation": {
          return [ref.value.unique && a[0], a[1] || ref.value.nullable];
        }
        case "query": {
          return [a[0] && ref.value.retCardinality === "one", a[1] || ref.value.nullable];
        }
      }
    },
    [true, false]
  );
  return {
    name: direct[0],
    fromPath: targetPath,
    from: { kind: "model", refKey: ctx.refKey },
    refKey: "N/A",
    nullable,
    retCardinality: isOne ? "one" : "many",
    retType: _.last(targets)!.retType,
    filter: filterFromTargets(targets),
    joinPaths,
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

function calculateCardinality(
  ref: Ref<"reference" | "relation" | "query">,
  paths: QueryDefPath[]
): "one" | "many" {
  const joinsAllOnes = paths.every((p) => p.retCardinality === "one");
  const isOne =
    ref.kind === "reference" ||
    (ref.kind === "relation" && ref.value.unique) ||
    (ref.kind === "query" && ref.value.retCardinality === "one");
  return isOne && joinsAllOnes ? "one" : "many";
}

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
        retCardinality: calculateCardinality(ref, joinPaths),
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
