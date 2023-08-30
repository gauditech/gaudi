import _ from "lodash";

import { concatUrlFragments } from "@compiler/common/utils";
import { EndpointDef } from "@compiler/types/definition";

export type EndpointPath = {
  fullPath: string;
  fragments: PathFragment[];
};

export type PathFragmentNamespace = { kind: "namespace"; name: string };
export type PathFragmentIdentifier = {
  kind: "identifier";
  type: "integer" | "string";
  name: string;
};
export type PathQueryParameter = {
  kind: "query";
  name: string;
  required: boolean;
} & ({ type: "string"; defaultValue?: string } | { type: "integer"; defaultValue?: number });
export type PathFragment = PathFragmentNamespace | PathFragmentIdentifier | PathQueryParameter;

export function buildEndpointPath(endpoint: EndpointDef): EndpointPath {
  const fragments = buildFragments(endpoint);
  return {
    fullPath: concatUrlFragments(
      "/", // leading "/"
      ...fragments
        // filter out non-path fragments
        .filter((frag) => frag.kind === "namespace" || frag.kind === "identifier")
        .map(fragmentToString)
    ),
    fragments,
  };
}

function buildFragments(endpoint: EndpointDef): PathFragment[] {
  const contextFragments = endpoint.parentContext.flatMap((target): PathFragment[] => {
    const path: PathFragment[] = [{ kind: "namespace", name: _.snakeCase(target.name) }];
    if (target.identifyWith) {
      path.push({
        kind: "identifier",
        type: target.identifyWith.type,
        name: target.identifyWith.paramName,
      });
    }
    return path;
  });

  // --- custom endpoint path suffix
  const targetNs: PathFragment = { kind: "namespace", name: _.snakeCase(endpoint.target.name) };
  // custom endpoint add their own suffix
  const customPathSuffix: PathFragment[] =
    endpoint.kind === "custom-one" || endpoint.kind === "custom-many"
      ? [
          {
            kind: "namespace",
            name: encodeURIComponent(endpoint.path),
          },
        ]
      : [];

  // --- path parameters

  // default page size
  const limitDefault = 20; // TODO: put this in some config or validation
  const isPageable = endpoint.kind === "list" && endpoint.pageable;
  const pathParams: PathQueryParameter[] = [
    // paging parameters
    ...(isPageable
      ? ([
          {
            kind: "query",
            name: "pageSize",
            type: "integer",
            required: false,
            defaultValue: limitDefault,
            // TODO: validate max size
          },
          { kind: "query", name: "page", type: "integer", required: false, defaultValue: 1 },
        ] as const)
      : []),
  ];

  switch (endpoint.kind) {
    case "get":
    case "update":
    case "delete":
    case "custom-one": {
      const path: PathFragment[] = [...contextFragments, targetNs];
      if (endpoint.target.identifyWith) {
        path.push({
          kind: "identifier",
          type: endpoint.target.identifyWith.type,
          name: endpoint.target.identifyWith.paramName,
        });
      }
      path.push(...customPathSuffix);
      return path;
    }
    case "create":
    case "list":
    case "custom-many": {
      return [...contextFragments, targetNs, ...customPathSuffix, ...pathParams];
    }
  }
}

function fragmentToString(fragment: PathFragment) {
  switch (fragment.kind) {
    case "namespace":
      return fragment.name;
    case "identifier":
      return `:${fragment.name}`;
  }
}
