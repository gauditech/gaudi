import _ from "lodash";

import { EndpointDef } from "@src/types/definition";

export type PathParam = { path: string; params: { name: string; type: "integer" | "text" }[] };

export function buildEndpointPath(endpoint: EndpointDef): PathParam {
  const pairs = endpoint.targets.map((target) => ({
    name: target.name.toLowerCase(),
    param: { name: target.identifyWith.paramName, type: target.identifyWith.type },
  }));
  switch (endpoint.kind) {
    case "get":
    case "update":
    case "delete":
      return {
        path: [
          "", // add leading slash
          ...pairs.map(({ name, param }) => [name, `:${param.name}`].join("/")),
        ].join("/"),
        params: pairs.map(({ param }) => param),
      };
    case "list":
    case "create":
      return {
        path: [
          "", // add leading slash
          ...pairs
            .slice(0, pairs.length - 1)
            .map(({ name, param }) => [name, `:${param.name}`].join("/")),
          pairs[pairs.length - 1].name,
        ].join("/"),
        params: pairs.slice(0, pairs.length - 1).map(({ param }) => param),
      };
  }
}
