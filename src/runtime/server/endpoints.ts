import { Express, Request, Response } from "express";
import _, { compact } from "lodash";

import { endpointQueries } from "../query/build";
import { Params, executeQuery, executeQueryTree } from "../query/exec";

import { buildAdminEntrypoints } from "./admin";
import { db } from "./dbConn";

import { PathParam, buildEndpointPath } from "@src/builder/query";
import { getRef } from "@src/common/refs";
import { buildChangset } from "@src/runtime/common/changeset";
import { validateEndpointFieldset } from "@src/runtime/common/validation";
import { authenticationHandler, buildEndpoints } from "@src/runtime/server/authentication";
import { BusinessError, errorResponse } from "@src/runtime/server/error";
import { endpointGuardHandler } from "@src/runtime/server/middleware";
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
    .forEach((epc) => registerServerEndpoint(app, epc, "/api"));
  // authentication endpoints
  buildEndpoints().forEach((epc) => {
    registerServerEndpoint(app, epc, "/api");
  });
  // admin entpoints
  buildAdminEntrypoints(definition)
    .flatMap((entrypoint) => processEntrypoint(definition, entrypoint, []))
    .forEach((epc) => registerServerEndpoint(app, epc, "/admin/api"));
}

/** Register endpoint on server instance */
export function registerServerEndpoint(app: Express, epConfig: EndpointConfig, pathPrefix: string) {
  app[epConfig.method](
    pathPrefix + epConfig.path,
    ...epConfig.handlers.map((handler) => endpointGuardHandler(handler))
  );
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

  const requiresAuthentication = true; // TODO: read from endpoint

  return {
    path: endpointPath.path,
    method: "get",
    handlers: compact([
      // prehandlers
      requiresAuthentication ? authenticationHandler({ allowAnonymous: true }) : undefined,
      // handler
      async (req: Request, resp: Response) => {
        try {
          console.log("AUTH USER", req.user);

          const contextParams = extractParams(endpointPath.params, req.params);

          const q = endpointQueries(def, endpoint).target;
          const targetQueryResult = await executeQueryTree(db, def, q, contextParams, []);
          if (targetQueryResult.length === 0) {
            throw new BusinessError("ERROR_CODE_SERVER_ERROR", "Internal error");
          }
          if (targetQueryResult.length > 1) {
            throw new BusinessError("ERROR_CODE_RESOURCE_NOT_FOUND", "Resource not found");
          }
          resp.json(targetQueryResult[0]);
        } catch (err) {
          errorResponse(err);
        }
      },
    ]),
  };
}

/** Create "list" endpoint handler from definition */
export function buildListEndpoint(def: Definition, endpoint: ListEndpointDef): EndpointConfig {
  const endpointPath = buildEndpointPath(endpoint);

  const requiresAuthentication = true; // TODO: read from endpoint

  return {
    path: endpointPath.path,
    method: "get",
    handlers: compact([
      // prehandlers
      requiresAuthentication ? authenticationHandler({ allowAnonymous: true }) : undefined,
      // handler
      async (req: Request, resp: Response) => {
        try {
          console.log("AUTH USER", req.user);

          const contextParams = extractParams(endpointPath.params, req.params);
          const queries = endpointQueries(def, endpoint);
          if (queries.context) {
            const contextQueryResult = await executeQuery(
              db,
              def,
              queries.context,
              contextParams,
              []
            );
            if (contextQueryResult.length === 0) {
              throw new BusinessError("ERROR_CODE_SERVER_ERROR", "Internal error");
            }
            if (contextQueryResult.length > 1) {
              throw new BusinessError("ERROR_CODE_RESOURCE_NOT_FOUND", "Resource not found");
            }
            const ids = contextQueryResult.map((r: any): number => r.id);
            const targetQueryResult = await executeQueryTree(
              db,
              def,
              queries.target,
              contextParams,
              ids
            );
            resp.json(targetQueryResult);
          } else {
            const targetQueryResult = await executeQueryTree(
              db,
              def,
              queries.target,
              contextParams,
              []
            );
            resp.json(targetQueryResult);
          }
        } catch (err) {
          errorResponse(err);
        }
      },
    ]),
  };
}

/** Build "create" endpoint handler from definition */
export function buildCreateEndpoint(def: Definition, endpoint: CreateEndpointDef): EndpointConfig {
  const endpointPath = buildEndpointPath(endpoint);

  const requiresAuthentication = false; // TODO: read from endpoint

  return {
    path: endpointPath.path,
    method: "post",
    handlers: compact([
      // prehandlers
      requiresAuthentication ? authenticationHandler() : undefined,
      // handler
      async (req: Request, resp: Response) => {
        try {
          console.log("AUTH USER", req.user);

          const contextParams = extractParams(endpointPath.params, req.params);

          const body = req.body;
          console.log("CTX PARAMS", contextParams);
          console.log("BODY", body);

          const queries = endpointQueries(def, endpoint);
          if (queries.context) {
            const contextQueryResult = await executeQuery(
              db,
              def,
              queries.context,
              contextParams,
              []
            );
            if (contextQueryResult.length === 0) {
              throw new BusinessError("ERROR_CODE_SERVER_ERROR", "Internal error");
            }
            if (contextQueryResult.length > 1) {
              throw new BusinessError("ERROR_CODE_RESOURCE_NOT_FOUND", "Resource not found");
            }
          }

          const validationResult = await validateEndpointFieldset(endpoint.fieldset, body);
          console.log("Validation result", validationResult);

          const actionChangeset = buildChangset(endpoint.contextActionChangeset, {
            input: validationResult,
          });
          console.log("Changeset result", actionChangeset);

          const id = await insertData(def, endpoint, actionChangeset);
          if (id === null) {
            throw new BusinessError("ERROR_CODE_SERVER_ERROR", "Insert failed");
          }
          console.log("Query result", id);

          resp.json({ id });
        } catch (err) {
          errorResponse(err);
        }
      },
    ]),
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
): Promise<number | null> {
  const target = endpoint.targets.slice(-1).shift();
  if (target == null) throw `Endpoint insert target is empty`;

  const { value: model } = getRef<"model">(definition, target.retType);

  // TODO: return `endpoint.response` instead of `id` here
  const ret = await db.insert(dataToDbnames(model, data)).into(model.dbname).returning("id");
  if (!ret.length) return null;
  return ret[0].id;
}

function dataToDbnames(model: ModelDef, data: Record<string, unknown>): Record<string, unknown> {
  return _.chain(data)
    .toPairs()
    .map(([name, value]) => [nameToDbname(model, name), value])
    .fromPairs()
    .value();
}

function nameToDbname(model: ModelDef, name: string): string {
  const field = model.fields.find((f) => f.name === name);
  if (!field) {
    throw new Error(`Field ${model.name}.${name} doesn't exist`);
  }
  return field.dbname;
}
