import _ from "lodash";

import {
  QueryTree,
  applyFilterIdInContext,
  buildQueryTree,
  queryFromParts,
  transformSelectPath,
} from "./build";

import { Definition, EndpointDef, FilterDef, TargetDef } from "@src/types/definition";

/**
 * Endpoint query builder
 */

export type EndpointQueries = {
  parentContextQueryTrees: QueryTree[];
  targetQueryTree: QueryTree;
  responseQueryTree: QueryTree;
};

export function buildEndpointQueries(def: Definition, endpoint: EndpointDef): EndpointQueries {
  const parentContextQueryTrees = endpoint.parentContext.map((target, index) => {
    const parentTarget = index === 0 ? null : endpoint.parentContext[index - 1];
    const namePath = parentTarget ? [parentTarget.retType, target.name] : [target.retType];
    // apply identifyWith filter
    const targetFilter = targetToFilter({ ...target, namePath });
    // apply filter from it's parent
    const filter = parentTarget
      ? applyFilterIdInContext([parentTarget.retType], targetFilter)
      : targetFilter;

    const select = transformSelectPath(target.select, target.namePath, namePath);
    const query = queryFromParts(def, target.alias, namePath, filter, select);
    return buildQueryTree(def, query);
  });

  // repeat the same for target
  const parentTarget = _.last(endpoint.parentContext);
  const namePath = parentTarget
    ? [parentTarget.retType, endpoint.target.name]
    : [endpoint.target.retType];

  const targetFilter =
    endpoint.kind === "create" || endpoint.kind === "list"
      ? undefined
      : targetToFilter({ ...endpoint.target, namePath });

  const filter = parentTarget
    ? applyFilterIdInContext([parentTarget.retType], targetFilter)
    : targetFilter;

  const select = transformSelectPath(endpoint.target.select, endpoint.target.namePath, namePath);

  const targetQuery = queryFromParts(def, endpoint.target.alias, namePath, filter, select);
  const targetQueryTree = buildQueryTree(def, targetQuery);

  // response query
  const responseQueryTree = buildResponseQueryTree(def, endpoint);

  return { parentContextQueryTrees, targetQueryTree, responseQueryTree };
}

/**
 * Response query is responsible for fetching the record(s) in order to return the data
 * to the client initiating the request. Response queries ignore `target.identifyWith`
 * filter, instead they fetch by parent `id` (`list`) or a record `id` (`get`, `update`).
 *
 * This is because `id` is the only non-modifiable identifier for a record; it's possible
 * that (custom) actions modify the record in a way that it no longer passes the filter
 * condition. For example, `target.identifyWith` may be a `slug` field and `update` changes
 * the `slug` field to another value.
 *
 * Therefore, we first fetch all targets using `identifyWith` to find their `id` which we
 * use to refetch the `response` query tree after actions are applied.
 */
function buildResponseQueryTree(def: Definition, endpoint: EndpointDef): QueryTree {
  switch (endpoint.kind) {
    case "update":
    case "create":
    case "delete": // FIXME delete should have no response query! Make it nullable?
    case "get": {
      // fetch directly from the table, we have the ID
      const namePath = [endpoint.target.retType];
      const filter = applyFilterIdInContext(namePath, undefined);
      const response = transformSelectPath(
        endpoint.response ?? [],
        endpoint.target.namePath,
        namePath
      );
      const responseQuery = queryFromParts(def, endpoint.target.alias, namePath, filter, response);
      return buildQueryTree(def, responseQuery);
    }
    case "list": {
      const parentTarget = _.last(endpoint.parentContext);
      const namePath = parentTarget
        ? [parentTarget.retType, endpoint.target.name]
        : [endpoint.target.retType];
      const filter = parentTarget
        ? applyFilterIdInContext([parentTarget.retType], undefined)
        : undefined;

      const response = transformSelectPath(
        endpoint.response ?? [],
        endpoint.target.namePath,
        namePath
      );
      const responseQuery = queryFromParts(def, endpoint.target.alias, namePath, filter, response);
      return buildQueryTree(def, responseQuery);
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
