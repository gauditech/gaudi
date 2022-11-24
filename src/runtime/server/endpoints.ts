import { Express, Request, Response } from "express";
import _, { chain, compact } from "lodash";

import { EndpointPath, PathFragmentIdentifier, buildEndpointPath } from "@src/builder/query";
import { getRef } from "@src/common/refs";
import { buildChangset } from "@src/runtime/common/changeset";
import { validateEndpointFieldset } from "@src/runtime/common/validation";
import { endpointQueries } from "@src/runtime/query/build";
import { Params, executeQueryTree } from "@src/runtime/query/exec";
import { authenticationHandler } from "@src/runtime/server/authentication";
import { db } from "@src/runtime/server/dbConn";
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
  const queries = endpointQueries(def, endpoint);

  const requiresAuthentication = true; // TODO: read from endpoint

  return {
    path: endpointPath.fullPath,
    method: "get",
    handlers: compact([
      // prehandlers
      requiresAuthentication ? authenticationHandler({ allowAnonymous: true }) : undefined,
      // handler
      async (req: Request, resp: Response) => {
        try {
          console.log("AUTH USER", req.user);

          const contextParams = extractPathParams(endpointPath, req.params);
          const context = new Map<string, any>(Object.entries(contextParams));

          // group context and target queries since all are findOne
          const allQueries = [...queries.parentContextQueryTrees, queries.targetQueryTree];
          let pids: number[] = [];
          for (const qt of allQueries) {
            const results = await executeQueryTree(db, def, qt, contextParams, pids);
            const result = findOne(results);
            context.set(qt.alias, result);
            pids = [result.id];
          }

          // FIXME run custom actions

          // FIXME refetch using the response query
          resp.json(context.get(queries.targetQueryTree.alias));
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
  const queries = endpointQueries(def, endpoint);

  const requiresAuthentication = true; // TODO: read from endpoint

  return {
    path: endpointPath.fullPath,
    method: "get",
    handlers: compact([
      // prehandlers
      requiresAuthentication ? authenticationHandler({ allowAnonymous: true }) : undefined,
      // handler
      async (req: Request, resp: Response) => {
        try {
          console.log("AUTH USER", req.user);

          const contextParams = extractPathParams(endpointPath, req.params);
          const context = new Map<string, any>(Object.entries(contextParams));

          let pids: number[] = [];
          for (const qt of queries.parentContextQueryTrees) {
            const results = await executeQueryTree(db, def, qt, contextParams, pids);
            const result = findOne(results);
            context.set(qt.alias, result);
            pids = [result.id];
          }

          // fetch target query (list, so no findOne here)
          const tQt = queries.targetQueryTree;
          const results = await executeQueryTree(db, def, tQt, contextParams, pids);
          context.set(tQt.alias, results);

          // FIXME run custom actions

          // FIXME refetch using the response query
          resp.json(context.get(tQt.alias));
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
  const queries = endpointQueries(def, endpoint);

  const requiresAuthentication = false; // TODO: read from endpoint

  return {
    path: endpointPath.fullPath,
    method: "post",
    handlers: compact([
      // prehandlers
      requiresAuthentication ? authenticationHandler() : undefined,
      // handler
      async (req: Request, resp: Response) => {
        try {
          console.log("AUTH USER", req.user);

          const contextParams = extractPathParams(endpointPath, req.params);
          const context = new Map<string, any>(Object.entries(contextParams));

          let pids: number[] = [];
          for (const qt of queries.parentContextQueryTrees) {
            const results = await executeQueryTree(db, def, qt, contextParams, pids);
            const result = findOne(results);
            context.set(qt.alias, result);
            pids = [result.id];
          }

          const body = req.body;
          console.log("CTX PARAMS", contextParams);
          console.log("BODY", body);

          const validationResult = await validateEndpointFieldset(endpoint.fieldset, body);
          console.log("Validation result", validationResult);

          // FIXME this is only temporary
          // find default changeset
          const act = endpoint.actions.find((a) => a.alias === endpoint.target.alias)!;
          const actionChangeset = buildChangset(act.changeset, {
            input: validationResult,
          });
          console.log("Changeset result", actionChangeset);

          // FIXME run custom actions

          const id = await insertData(def, endpoint, actionChangeset);
          if (id === null) {
            throw new BusinessError("ERROR_CODE_SERVER_ERROR", "Insert failed");
          }
          console.log("Query result", id);

          // FIXME refetch using the response query
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
  const queries = endpointQueries(def, endpoint);

  const requiresAuthentication = false; // TODO: read from endpoint

  return {
    path: endpointPath.fullPath,
    method: "patch",
    handlers: compact([
      // prehandlers
      requiresAuthentication ? authenticationHandler() : undefined,
      // handler
      async (req: Request, resp: Response) => {
        try {
          console.log("AUTH USER", req.user);

          const contextParams = extractPathParams(endpointPath, req.params);
          const context = new Map<string, any>(Object.entries(contextParams));

          let pids: number[] = [];
          // group context and target queries since all are findOne
          // FIXME implement "SELECT FOR UPDATE"
          const allQueries = [...queries.parentContextQueryTrees, queries.targetQueryTree];
          for (const qt of allQueries) {
            const results = await executeQueryTree(db, def, qt, contextParams, pids);
            const result = findOne(results);
            context.set(qt.alias, result);
            pids = [result.id];
          }

          const body = req.body;
          console.log("CTX PARAMS", contextParams);
          console.log("BODY", body);

          console.log("FIELDSET", endpoint.fieldset);

          const validationResult = await validateEndpointFieldset(endpoint.fieldset, body);
          console.log("Validation result", validationResult);

          // FIXME this is only temporary
          // find default changeset
          const act = endpoint.actions.find((a) => a.alias === endpoint.target.alias)!;

          const actionChangeset = buildChangset(act.changeset, {
            input: validationResult,
          });

          const target = context.get(endpoint.target.alias);
          const id = await updateData(def, endpoint, target.id, actionChangeset);
          if (id === null) {
            throw new BusinessError("ERROR_CODE_SERVER_ERROR", "Update failed");
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
  const queries = endpointQueries(def, endpoint);

  const requiresAuthentication = true; // TODO: read from endpoint

  return {
    path: endpointPath.fullPath,
    method: "delete",
    handlers: compact([
      // prehandlers
      requiresAuthentication ? authenticationHandler({ allowAnonymous: true }) : undefined,
      // handler
      async (req: Request, resp: Response) => {
        try {
          console.log("AUTH USER", req.user);

          const contextParams = extractPathParams(endpointPath, req.params);
          const context = new Map<string, any>(Object.entries(contextParams));

          let pids: number[] = [];
          // group context and target queries since all are findOne
          // FIXME implement "SELECT FOR UPDATE"
          const allQueries = [...queries.parentContextQueryTrees, queries.targetQueryTree];
          for (const qt of allQueries) {
            const results = await executeQueryTree(db, def, qt, contextParams, pids);
            const result = findOne(results);
            context.set(qt.alias, result);
            pids = [result.id];
          }

          const target = context.get(endpoint.target.alias);
          await deleteData(def, endpoint, target.id);

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
export function extractPathParams(path: EndpointPath, sourceMap: Record<string, string>): Params {
  const paramPairs = path.fragments
    .filter((frag): frag is PathFragmentIdentifier => frag.kind === "identifier")
    .map((frag): [string, string | number] => [
      frag.alias,
      validatePathIdentifier(frag, sourceMap[frag.alias]),
    ]);

  return Object.fromEntries(paramPairs);
}

/**
 * Validate and convert an input to a proper type based on definition.
 */
function validatePathIdentifier(fragment: PathFragmentIdentifier, val: string): string | number {
  switch (fragment.type) {
    case "integer": {
      const n = Number(val);
      if (Number.isNaN(n)) {
        throw new Error(`Not a valid integer: ${val}`);
      }
      return n;
    }
    case "text": {
      return val;
    }
  }
}

/** Insert data to DB  */
async function insertData(
  definition: Definition,
  endpoint: EndpointDef,
  data: Record<string, unknown>
): Promise<number | null> {
  const target = endpoint.target;

  const { value: model } = getRef<"model">(definition, target.retType);

  // TODO: return action's `select` here
  const ret = await db.insert(dataToDbnames(model, data)).into(model.dbname).returning("id");

  // FIXME findOne? handle unexpected result
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
  const target = endpoint.target;
  if (target == null) throw `Endpoint update target is empty`;

  const { value: model } = getRef<"model">(definition, target.retType);

  // TODO: return action's `select` here
  const ret = await db(model.dbname)
    .where({ id: dataId })
    .update(dataToDbnames(model, data))
    .returning("id");

  // FIXME findOne? handle unexpected result
  if (!ret.length) return null;
  return ret[0].id;
}

/** Delete record in DB  */
async function deleteData(
  definition: Definition,
  endpoint: EndpointDef,
  dataId: number
): Promise<void> {
  const target = endpoint.target;
  if (target == null) throw `Endpoint update target is empty`;

  const { value: model } = getRef<"model">(definition, target.retType);

  await db(model.dbname).where({ id: dataId }).delete();
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

/** Return only one resulting row. If result contains 0 or more than 1 row, throw error. */
function findOne<T>(result: T[]): T {
  if (result.length === 0) {
    throw new BusinessError("ERROR_CODE_RESOURCE_NOT_FOUND", "Resource not found");
  }
  if (result.length > 1) {
    throw new BusinessError("ERROR_CODE_SERVER_ERROR", "Internal error");
  }

  return result[0];
}
