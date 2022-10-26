import { Express, Request, Response } from "express";
import _ from "lodash";

import { endpointQueries } from "../query/buildQuery";
import { Params, executeQuery } from "../query/execQuery";

import { db } from "./dbConn";

import { PathParam, buildEndpointPath } from "@src/builder/query";
import { getTargetModel } from "@src/common/refs";
import { buildChangset } from "@src/runtime/common/changeset";
import { validateEndpointFieldset } from "@src/runtime/common/validation";
import { EndpointError } from "@src/runtime/server/error";
import { endpointHandlerGuard } from "@src/runtime/server/middleware";
import { EndpointConfig } from "@src/runtime/server/types";
import {
  CreateEndpointDef,
  Definition,
  EndpointDef,
  EntrypointDef,
  GetEndpointDef,
  ListEndpointDef,
  ModelDef,
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
      return buildGetEndpoint(def, endpoint);
    case "list":
      return buildListEndpoint(def, endpoint);
    case "create":
      return buildCreateEndpoint(def, endpoint);
    default:
      console.warn(`Endpoint kind "${endpoint.kind}" not yet implemented`);
      return null;
  }
}

/** Create "get" endpoint handler from definition */
export function buildGetEndpoint(def: Definition, endpoint: GetEndpointDef): EndpointConfig {
  const endpointPath = buildEndpointPath(endpoint);

  return {
    path: endpointPath.path,
    method: "get",
    handler: async (req: Request, resp: Response) => {
      try {
        const contextParams = extractParams(endpointPath.params, req.params);
        const q = endpointQueries(def, endpoint).target;
        const targetQueryResult = await executeQuery(def, q, contextParams, []);
        if (targetQueryResult.length === 0) {
          throw new EndpointError(404, "Resource not found");
        } else if (targetQueryResult.length > 1) {
          throw new EndpointError(500, "Error processing request", {
            message: "findOne found multiple records",
          });
        }
        resp.json(targetQueryResult[0]);
      } catch (err) {
        if (err instanceof EndpointError) {
          throw err;
        } else {
          throw new EndpointError(500, "Error processing request", err);
        }
      }
    },
  };
}

/** Create "list" endpoint handler from definition */
export function buildListEndpoint(def: Definition, endpoint: ListEndpointDef): EndpointConfig {
  const endpointPath = buildEndpointPath(endpoint);

  return {
    path: endpointPath.path,
    method: "get",
    handler: async (req: Request, resp: Response) => {
      try {
        const contextParams = extractParams(endpointPath.params, req.params);
        const queries = endpointQueries(def, endpoint);
        if (queries.context) {
          const contextResponse = await executeQuery(def, queries.context, contextParams, []);
          if (contextResponse.length === 0) {
            throw new EndpointError(404, "Resource not found");
          } else if (contextResponse.length > 1) {
            throw new EndpointError(500, "Error processing request", {
              message: "findOne found multiple records",
            });
          }
          const ids = contextResponse.map((r: any): number => r.id);
          // apply filters
          const targetQueryResult = await executeQuery(def, queries.target, contextParams, ids);
          resp.json(targetQueryResult);
        } else {
          const targetQueryResult = await executeQuery(def, queries.target, contextParams, []);
          resp.json(targetQueryResult);
        }
      } catch (err) {
        if (err instanceof EndpointError) {
          throw err;
        } else {
          throw new EndpointError(500, "Error processing request", err);
        }
      }
    },
  };
}

/** Build "create" endpoint handler from definition */
export function buildCreateEndpoint(def: Definition, endpoint: CreateEndpointDef): EndpointConfig {
  const endpointPath = buildEndpointPath(endpoint);

  return {
    path: endpointPath.path,
    method: "post",
    handler: async (req: Request, resp: Response) => {
      try {
        const contextParams = extractParams(endpointPath.params, req.params);
        const body = req.body;
        console.log("BODY", body);

        const validationResult = await validateEndpointFieldset(body, endpoint.fieldset);
        console.log("Validation result", validationResult);

        const actionChangeset = buildChangset(endpoint.contextActionChangeset, {
          input: validationResult,
        });
        console.log("Changeset result", actionChangeset);

        const queryResult = await insertData(def, endpoint, actionChangeset);
        console.log("Query result", queryResult);

        resp.json(queryResult);
      } catch (err) {
        if (err instanceof EndpointError) {
          throw err;
        } else {
          throw new EndpointError(500, "Error processing request", err);
        }
      }
    },
  };
}

/**
 * Extract/filter only required props from source map (eg. from request params).
 */

export function extractParams(
  params: PathParam["params"],
  sourceMap: Record<string, string>
): Params {
  return Object.fromEntries(params.map((p) => [p.name, validatePathParam(p, sourceMap[p.name])]));
}

/**
 * Cast an input based on PathParam.param definition.
 */
function validatePathParam(param: PathParam["params"][number], val: string): string | number {
  switch (param.type) {
    case "integer": {
      const n = Number(val);
      if (Number.isNaN(n)) {
        throw new Error(`Not a valid integer`);
      }
      return n;
    }
    case "text":
      return val;
  }
}

/** Insert data to DB  */
async function insertData(
  definition: Definition,
  endpoint: EndpointDef,
  data: Record<string, unknown>
) {
  const target = endpoint.targets.slice(-1).shift();
  if (target == null) throw `Endpoint insert target is empty`;

  const model: ModelDef = getTargetModel(definition.models, target.refKey);

  return db.insert(data).into(model.dbname);
}
