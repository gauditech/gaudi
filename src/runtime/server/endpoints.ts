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
import {
  EndpointHttpResponseError,
  GaudiBusinessError,
  createEndpointHttpResponseError,
  createResourceNotFoundGaudiBusinessError,
  createServerErrorEndpointHttpResponseError,
} from "@src/runtime/server/error";
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
          throw createResourceNotFoundGaudiBusinessError();
        }
        resp.json(targetQueryResult.rows[0]);
      } catch (err) {
        handleEndpointError(err);
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
          console.log("SQL", ctxTpl);
          const contextResponse = await db.raw(ctxTpl, contextParams);
          if (contextResponse.rowCount !== 1) {
            throw createResourceNotFoundGaudiBusinessError();
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
        handleEndpointError(err);
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
        console.log("CTX PARAMS", contextParams);
        console.log("BODY", body);

        const ctxTpl = await buildEndpointContextSql(def, endpoint);
        if (ctxTpl) {
          console.log("SQL", ctxTpl);

          const contextResponse = await db.raw(ctxTpl, contextParams);
          if (contextResponse.rowCount !== 1) {
            throw createResourceNotFoundGaudiBusinessError();
          }
        }

        const validationResult = await validateEndpointFieldset(endpoint.fieldset, body);
        console.log("Validation result", validationResult);

        const actionChangeset = buildChangset(endpoint.contextActionChangeset, {
          input: validationResult,
        });
        console.log("Changeset result", actionChangeset);

        const queryResult = await insertData(def, endpoint, actionChangeset);
        console.log("Query result", queryResult);

        resp.json(queryResult);
      } catch (err) {
        handleEndpointError(err);
      }
    },
  };
}

function handleEndpointError(err: unknown) {
  if (err instanceof GaudiBusinessError) {
    // TODO: maybe we could add to definition a code->reponse mapping table.
    // This mapping would define which errors endpoint throws and it could
    // be used here but alson in API definition (eg. swagger)
    // Eg.
    //  - ERROR_CODE_VALIDATION -> { 400, "Validation error" }
    //  - ERROR_CODE_RESOURCE_NOT_FOUND -> { 404, "Not found" }
    //  - * -> { 500, "Server error" }
    //  - ...

    if (err.code === "ERROR_CODE_VALIDATION") {
      throw createEndpointHttpResponseError(400, err);
    }
    if (err.code === "ERROR_CODE_RESOURCE_NOT_FOUND") {
      throw createEndpointHttpResponseError(404, err);
    }
  }

  if (err instanceof EndpointHttpResponseError) {
    throw err;
  }

  throw createServerErrorEndpointHttpResponseError(err);
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
