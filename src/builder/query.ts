import _ from "lodash";

import { EndpointDef } from "@src/types/definition";

export type EndpointPath = {
  fullPath: string;
  fragments: PathFragment[];
};

export type PathFragmentNamespace = { kind: "namespace"; name: string };
export type PathFragmentIdentifier = {
  kind: "identifier";
  type: "integer" | "text";
  name: string;
};
export type PathQueryParameter = {
  kind: "query";
  name: string;
  required: boolean;
} & ({ type: "text"; defaultValue?: string } | { type: "integer"; defaultValue?: number });
export type PathFragment = PathFragmentNamespace | PathFragmentIdentifier | PathQueryParameter;

export function buildEndpointPath(endpoint: EndpointDef): EndpointPath {
  const fragments = buildFragments(endpoint);
  return {
    fullPath: [
      "",
      ...fragments
        // filter out non-path fragments
        .filter((frag) => frag.kind === "namespace" || frag.kind === "identifier")
        .map(fragmentToString),
    ].join("/"),
    fragments,
  };
}

function buildFragments(endpoint: EndpointDef): PathFragment[] {
  const contextFragments = endpoint.parentContext.flatMap((target): PathFragment[] => [
    { kind: "namespace", name: _.snakeCase(target.name) },
    {
      kind: "identifier",
      type: target.identifyWith.type,
      name: target.identifyWith.paramName,
    },
  ]);

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
          },
          { kind: "query", name: "page", type: "integer", required: false, defaultValue: 0 },
        ] as const)
      : []),
  ];

  switch (endpoint.kind) {
    case "get":
    case "update":
    case "delete":
    case "custom-one": {
      return [
        ...contextFragments,
        targetNs,
        {
          kind: "identifier",
          type: endpoint.target.identifyWith.type,
          name: endpoint.target.identifyWith.paramName,
        },
        ...customPathSuffix,
      ];
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
