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
  alias: string;
};
export type PathFragment = PathFragmentNamespace | PathFragmentIdentifier;

export function buildEndpointPath(endpoint: EndpointDef): EndpointPath {
  const fragments = buildFragments(endpoint);
  return {
    fullPath: ["", ...fragments.map(fragmentToString)].join("/"),
    fragments,
  };
}

function buildFragments(endpoint: EndpointDef): PathFragment[] {
  const contextFragments = endpoint.parentContext.flatMap((target): PathFragment[] => [
    { kind: "namespace", name: target.name },
    {
      kind: "identifier",
      type: target.identifyWith.type,
      alias: target.identifyWith.paramName,
    },
  ]);
  const targetNs: PathFragment = { kind: "namespace", name: endpoint.target.name };
  switch (endpoint.kind) {
    case "get":
    case "update":
    case "delete": {
      return [
        ...contextFragments,
        targetNs,
        {
          kind: "identifier",
          type: endpoint.target.identifyWith.type,
          alias: endpoint.target.identifyWith.paramName,
        },
      ];
    }
    case "create":
    case "list": {
      return [...contextFragments, targetNs];
    }
  }
}

function fragmentToString(fragment: PathFragment) {
  switch (fragment.kind) {
    case "namespace":
      return fragment.name;
    case "identifier":
      return `:${fragment.alias}`;
  }
}
