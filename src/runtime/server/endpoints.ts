import { Express, Request, Response } from "express";
import { chain, compact } from "lodash";

import { PathParam, buildEndpointPath } from "@src/builder/query";
import { getRef } from "@src/common/refs";
import { buildChangset } from "@src/runtime/common/changeset";
import { validateEndpointFieldset } from "@src/runtime/common/validation";
import { EndpointQueries, endpointQueries } from "@src/runtime/query/build";
import { Params, executeQuery, executeQueryTree } from "@src/runtime/query/exec";
import { authenticationHandler } from "@src/runtime/server/authentication";
import { getContext } from "@src/runtime/server/context";
import { BusinessError, errorResponse } from "@src/runtime/server/error";
import { endpointGuardHandler } from "@src/runtime/server/middleware";
import { EndpointConfig } from "@src/runtime/server/types";
import {
  CreateEndpointDef,
  Definition,
  DeleteEndpointDef,
  EndpointDef,
  EntrypointDef,
  GetEndpointDef,
  ListEndpointDef,
  ModelDef,
  UpdateEndpointDef,
} from "@src/types/definition";

/** Create endpoint configs from entrypoints */
export function buildEndpointConfig(definition: Definition, entrypoints: EntrypointDef[]) {
  return entrypoints.flatMap((entrypoint) => processEntrypoint(definition, entrypoint, []));
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
  const endpointOuts = entrypoint.endpoints.map((ep) => processEndpoint(def, ep));

  return [
    ...endpointOuts,
    ...(entrypoint.entrypoints?.flatMap((ep) => processEntrypoint(def, ep, entrypoints)) ?? []),
  ];
}

function processEndpoint(def: Definition, endpoint: EndpointDef): EndpointConfig {
  switch (endpoint.kind) {
    case "get":
      return buildGetEndpoint(def, endpoint);
    case "list":
      return buildListEndpoint(def, endpoint);
    case "create":
      return buildCreateEndpoint(def, endpoint);
    case "update":
      return buildUpdateEndpoint(def, endpoint);
    case "delete":
      return buildDeleteEndpoint(def, endpoint);
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

          const queries = endpointQueries(def, endpoint);
          const queryResult = await findOne(def, queries, contextParams);

          resp.json(queryResult);
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

          const ids = [];
          if (queries.context) {
            const queryResult = await findOne(def, queries, contextParams);

            ids.push(queryResult.id);
          }

          const targetQueryResult = await executeQueryTree(
            getContext().dbConn,
            def,
            queries.target,
            contextParams,
            ids
          );

          resp.json(targetQueryResult);
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
            findOne(def, queries, contextParams);
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

/** Build "update" endpoint handler from definition */
export function buildUpdateEndpoint(def: Definition, endpoint: UpdateEndpointDef): EndpointConfig {
  const endpointPath = buildEndpointPath(endpoint);

  const requiresAuthentication = false; // TODO: read from endpoint

  return {
    path: endpointPath.path,
    method: "patch",
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

          const q = endpointQueries(def, endpoint);

          // FIXME implement "SELECT FOR UPDATE"
          // FIXME don't need to fetch the whole queryTree before update
          const queryResult = await findOne(def, q, contextParams);

          console.log("FIELDSET", endpoint.fieldset);

          const validationResult = await validateEndpointFieldset(endpoint.fieldset, body);
          console.log("Validation result", validationResult);

          const actionChangeset = buildChangset(endpoint.contextActionChangeset, {
            input: validationResult,
          });

          const id = await updateData(def, endpoint, queryResult.id, actionChangeset);
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

/** Create "delete" endpoint handler from definition */
export function buildDeleteEndpoint(def: Definition, endpoint: DeleteEndpointDef): EndpointConfig {
  const endpointPath = buildEndpointPath(endpoint);

  const requiresAuthentication = true; // TODO: read from endpoint

  return {
    path: endpointPath.path,
    method: "delete",
    handlers: compact([
      // prehandlers
      requiresAuthentication ? authenticationHandler({ allowAnonymous: true }) : undefined,
      // handler
      async (req: Request, resp: Response) => {
        try {
          console.log("AUTH USER", req.user);

          const contextParams = extractParams(endpointPath.params, req.params);

          const q = endpointQueries(def, endpoint);
          const queryResult = await findOne(def, q, contextParams);

          await deleteData(def, endpoint, queryResult.id);

          resp.sendStatus(200);
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
        throw new Error(`Not a valid integer: ${val}`);
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
  const ret = await getContext()
    .dbConn.insert(dataToDbnames(model, data))
    .into(model.dbname)
    .returning("id");
  if (!ret.length) return null;
  return ret[0].id;
}

/** Update record in DB  */
async function updateData(
  definition: Definition,
  endpoint: EndpointDef,
  dataId: number,
  data: Record<string, unknown>
): Promise<number | null> {
  const target = endpoint.targets.slice(-1).shift();
  if (target == null) throw `Endpoint update target is empty`;

  const { value: model } = getRef<"model">(definition, target.retType);

  // TODO: return `endpoint.response` instead of `id` here
  const ret = await getContext()
    .dbConn(model.dbname)
    .where({ id: dataId })
    .update(dataToDbnames(model, data))
    .returning("id");

  if (!ret.length) return null;
  return ret[0].id;
}

/** Delete record in DB  */
async function deleteData(
  definition: Definition,
  endpoint: EndpointDef,
  dataId: number
): Promise<void> {
  const target = endpoint.targets.slice(-1).shift();
  if (target == null) throw `Endpoint update target is empty`;

  const { value: model } = getRef<"model">(definition, target.retType);

  await getContext().dbConn(model.dbname).where({ id: dataId }).delete();
}

function dataToDbnames(model: ModelDef, data: Record<string, unknown>): Record<string, unknown> {
  return chain(data)
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

/** Return only one resulting row. If query returns 0 or more than 1 row, throw error. */
async function findOne(def: Definition, q: EndpointQueries, contextParams: Params) {
  let queryResult;
  if (q.context) {
    queryResult = await executeQuery(getContext().dbConn, def, q.context, contextParams, []);
  } else {
    queryResult = await executeQueryTree(getContext().dbConn, def, q.target, contextParams, []);
  }

  if (queryResult.length === 0) {
    throw new BusinessError("ERROR_CODE_RESOURCE_NOT_FOUND", "Resource not found");
  }
  if (queryResult.length > 1) {
    throw new BusinessError("ERROR_CODE_SERVER_ERROR", "Internal error");
  }

  return queryResult[0];
}
