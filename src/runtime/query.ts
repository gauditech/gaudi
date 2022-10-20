import _ from "lodash";

import { Ref, RefKind, getModelProp, getRef, getTargetModel } from "@src/common/refs";
import { ensureEqual } from "@src/common/utils";
import {
  Definition,
  EndpointDef,
  FilterDef,
  IQueryDefPath,
  ModelDef,
  QueryDef,
  QueryDefPath,
  TargetDef,
} from "@src/types/definition";

type NamePath = string[];

// FIXME add tests
export function mergePaths(paths: NamePath[]): NamePath[] {
  return _.uniqWith(paths, _.isEqual);
}

export function mkContextQuery(def: Definition, endpoint: EndpointDef): QueryDef | null {
  // this is context query, drop final target
  const targets = _.initial(endpoint.targets);
  if (!targets.length) return null;
  const targetPath = targets.map((t) => t.name);
  const filterPaths = targets.flatMap((t) => getFilterPaths(targetToFilter(t)));
  const paths = mergePaths([targetPath, ...filterPaths]);
  const direct = getDirectChildren(paths);
  ensureEqual(direct.length, 1);
  const { value: ctx } = getRef<"model">(def, direct[0]);
  const joinPaths = processPaths(def, getRelatedPaths(paths, ctx.name), ctx, [ctx.name]);
  // navigate through targets to find cardinality
  const [isOne, nullable] = targets.reduce(
    (a, t) => {
      const ref = getRef<"reference" | "relation" | "query">(def, t.name);
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
    ctxModelRefKey: ctx.refKey,
    refKey: "N/A",
    nullable, // fixme
    retCardinality: isOne ? "one" : "many",
    retType: _.last(targets)!.retType,
    filter: undefined, // fixme
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
        joinPaths,
        retType: getTargetModel(def.models, ref.value.refKey).name,
        retCardinality: calculateCardinality(ref, joinPaths),
      } as QueryDefPath;
      // FIXME typescript doesn't like this so we have to cast
    })
  );
}

function targetToFilter(target: TargetDef): FilterDef {
  return {
    kind: "binary",
    operator: "is",
    lhs: {
      kind: "alias",
      namePath: [...target.namePath, target.identifyWith.name],
    },
    rhs: { kind: "variable", name: target.identifyWith.paramName, type: target.identifyWith.type },
  };
}

// function mkTargetQuery(def: Definition, endpoint: EndpointDef): QueryDef {}

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
