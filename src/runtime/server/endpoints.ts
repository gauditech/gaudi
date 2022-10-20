import { Express, Request, Response } from "express";

import { db } from "./dbConn";

import {
  PathParam,
  buildEndpointContextSql,
  buildEndpointPath,
  buildEndpointTargetSql,
  selectToSelectable,
} from "@src/builder/query";
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

        // build target SQL
        const s = buildEndpointTargetSql(
          def,
          endpoint.targets,
          selectToSelectable(endpoint.response),
          "single"
        );
        const targetQueryResult = await db.raw(s, contextParams);
        if (targetQueryResult.rowCount !== 1) {
          throw new EndpointError(404, "Resource not found");
        }
        resp.json(targetQueryResult.rows[0]);
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

        const ctxTpl = await buildEndpointContextSql(def, endpoint);
        if (ctxTpl) {
          const contextResponse = await db.raw(ctxTpl, contextParams);
          if (contextResponse.rowCount !== 1) {
            throw new EndpointError(404, "Resource not found");
          }
        }
        const targetTpl = buildEndpointTargetSql(
          def,
          endpoint.targets,
          selectToSelectable(endpoint.response),
          "multi"
        );
        const targetQueryResult = await db.raw(targetTpl, contextParams);
        resp.json(targetQueryResult.rows);
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
): Record<string, string | number> {
  return Object.fromEntries(params.map((p) => [p.name, validatePathParam(p, sourceMap[p.name])]));
}

/**
 * Cast an input based on PathParam.param definition.
 */
function validatePathParam(param: PathParam["params"][number], val: string): string | number {
  switch (param.type) {
    case "integer":
      return parseInt(val, 10);
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
