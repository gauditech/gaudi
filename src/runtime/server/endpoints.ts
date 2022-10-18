import { Express, Request, Response } from "express";

import { buildEndpointPath } from "@src/builder/query";
import { EndpointError } from "@src/runtime/server/error";
import { endpointHandlerGuard } from "@src/runtime/server/middleware";
import { EndpointConfig } from "@src/runtime/server/types";
import {
  Definition,
  EndpointDef,
  EntrypointDef,
  GetEndpointDef,
  ListEndpointDef,
} from "@src/types/definition";

// ---------- server

/** Create endpoint handlers from definition and attach them on server instance */
export function setupEndpoints(app: Express, definition: Definition) {
  definition.entrypoints
    .flatMap((entrypoint) => processEntrypoint(definition, entrypoint, []))
    .forEach((epc) => {
      registerServerEndpoint(app, epc);
    });
}

/** Register endpoint on server instance */
export function registerServerEndpoint(app: Express, epConfig: EndpointConfig) {
  app[epConfig.method](epConfig.path, endpointHandlerGuard(epConfig.handler));
}

export function processEntrypoint(
  def: Definition,
  entrypoint: EntrypointDef,
  parentEntrypoints: EntrypointDef[]
): EndpointConfig[] {
  const entrypoints = [...parentEntrypoints, entrypoint];
  const endpointOuts = entrypoint.endpoints
    .map((ep) => processEndpoint(def, ep))
    .filter((epc): epc is NonNullable<EndpointConfig> => epc != null);

  return [
    ...endpointOuts,
    ...(entrypoint.entrypoints?.flatMap((ep) => processEntrypoint(def, ep, entrypoints)) ?? []),
  ];
}

function processEndpoint(def: Definition, endpoint: EndpointDef): EndpointConfig | null {
  switch (endpoint.kind) {
    case "get":
      return createGetEndpoint(def, endpoint);
    case "list":
      return createListEndpoint(def, endpoint);
    default:
      console.warn(`Endpoint kind "${endpoint.kind}" not yet implemented`);
      return null;
  }
}

/** Create "get" endpoint handler from definition */
export function createGetEndpoint(def: Definition, endpoint: GetEndpointDef): EndpointConfig {
  const endpointPath = buildEndpointPath(endpoint);

  return {
    path: endpointPath.path,
    method: "get",
    handler: async (req: Request, resp: Response) => {
      try {
        const contextParams = extractMapProps(
          endpointPath.params.map((p) => p.name),
          req.params
        );

        // TODO: replace dummy response
        resp.send(contextParams);
      } catch (err) {
        if (err instanceof EndpointError) {
          throw err;
        } else {
          throw new EndpointError(500, "Error processing request: " + err);
        }
      }
    },
  };
}

/** Create "list" endpoint handler from definition */
export function createListEndpoint(def: Definition, endpoint: ListEndpointDef): EndpointConfig {
  const endpointPath = buildEndpointPath(endpoint);

  return {
    path: endpointPath.path,
    method: "get",
    handler: async (req: Request, resp: Response) => {
      try {
        const contextParams = extractMapProps(
          endpointPath.params.map((p) => p.name),
          req.params
        );

        // TODO: replace dummy reponse
        resp.send(contextParams);
      } catch (err) {
        if (err instanceof EndpointError) {
          throw err;
        } else {
          throw new EndpointError(500, "Error processing request: " + err);
        }
      }
    },
  };
}

/**
 * Extract/filter only required props from source map (eg. from request params).
 */
export function extractMapProps(
  names: string[],
  sourceMap: Record<string, string>
): Record<string, string> {
  return names.reduce((accum, name) => {
    accum[name] = sourceMap[name];

    return accum;
  }, {} as Record<string, string>);
}
