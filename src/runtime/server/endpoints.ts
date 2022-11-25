import { Express, Request, Response } from "express";
import _, { compact } from "lodash";

import { Vars } from "./vars";

import { EndpointPath, PathFragmentIdentifier, buildEndpointPath } from "@src/builder/query";
import { dataToFieldDbnames, getRef } from "@src/common/refs";
import { buildChangset } from "@src/runtime/common/changeset";
import { validateEndpointFieldset } from "@src/runtime/common/validation";
import { endpointQueries } from "@src/runtime/query/build";
import { executeQueryTree } from "@src/runtime/query/exec";
import { authenticationHandler } from "@src/runtime/server/authentication";
import { getAppContext } from "@src/runtime/server/context";
import { DbConn } from "@src/runtime/server/dbConn";
import { BusinessError, errorResponse } from "@src/runtime/server/error";
import { endpointGuardHandler } from "@src/runtime/server/middleware";
import { EndpointConfig } from "@src/runtime/server/types";
import {
  CreateEndpointDef,
  CreateOneAction,
  Definition,
  DeleteEndpointDef,
  EndpointDef,
  EntrypointDef,
  GetEndpointDef,
  ListEndpointDef,
  UpdateEndpointDef,
  UpdateOneAction,
} from "@src/types/definition";

/** Create endpoint configs from entrypoints */
export function buildEndpointConfig(definition: Definition, entrypoints: EntrypointDef[]) {
  return flattenEndpoints(entrypoints).map((ep) => processEndpoint(definition, ep));
}

/** Extract endpoints from entrypoint hierarchy into a flattened map. */
export function flattenEndpoints(entrypoints: EntrypointDef[]): EndpointDef[] {
  return entrypoints.reduce((accum, entrypoint) => {
    const nestedEndpoints: EndpointDef[] = entrypoint.entrypoints.reduce((agg, entrypoint) => {
      return [...agg, ...flattenEndpoints([entrypoint])];
    }, [] as EndpointDef[]);
    return [...accum, ...entrypoint.endpoints, ...nestedEndpoints];
  }, [] as EndpointDef[]);
}

/** Register endpoint on server instance */
export function registerServerEndpoint(app: Express, epConfig: EndpointConfig, pathPrefix: string) {
  app[epConfig.method](
    pathPrefix + epConfig.path,
    ...epConfig.handlers.map((handler) => endpointGuardHandler(handler))
  );
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

  const requiresAuthentication = false; // TODO: read from endpoint

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
          const dbConn = getAppContext(req).dbConn;

          const pathParamVars = new Vars(extractPathParams(endpointPath, req.params));
          const contextVars = new Vars();

          // group context and target queries since all are findOne
          const allQueries = [...queries.parentContextQueryTrees, queries.targetQueryTree];
          let pids: number[] = [];
          for (const qt of allQueries) {
            const results = await executeQueryTree(dbConn, def, qt, pathParamVars, pids);
            const result = findOne(results);
            contextVars.set(qt.alias, result);
            pids = [result.id];
          }

          // FIXME run custom actions

          resp.json(contextVars.get(queries.targetQueryTree.alias));
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

  const requiresAuthentication = false; // TODO: read from endpoint

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
          const dbConn = getAppContext(req).dbConn;

          const pathParamVars = new Vars(extractPathParams(endpointPath, req.params));
          const contextVars = new Vars();

          let pids: number[] = [];
          for (const qt of queries.parentContextQueryTrees) {
            const results = await executeQueryTree(dbConn, def, qt, pathParamVars, pids);
            const result = findOne(results);
            contextVars.set(qt.alias, result);
            pids = [result.id];
          }

          // fetch target query (list, so no findOne here)
          const tQt = queries.targetQueryTree;
          const results = await executeQueryTree(dbConn, def, tQt, pathParamVars, pids);
          contextVars.set(tQt.alias, results);

          // FIXME run custom actions

          // FIXME refetch using the response query
          resp.json(contextVars.get(tQt.alias));
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
          const dbConn = getAppContext(req).dbConn;

          const pathParamVars = new Vars(extractPathParams(endpointPath, req.params));
          const contextVars = new Vars();

          let pids: number[] = [];
          for (const qt of queries.parentContextQueryTrees) {
            const results = await executeQueryTree(dbConn, def, qt, pathParamVars, pids);
            const result = findOne(results);
            contextVars.set(qt.alias, result);
            pids = [result.id];
          }

          const body = req.body;
          console.log("CTX PARAMS", pathParamVars);
          console.log("BODY", body);

          const validationResult = await validateEndpointFieldset(endpoint.fieldset, body);
          console.log("Validation result", validationResult);

          // FIXME this is only temporary
          // find default changeset
          const act = endpoint.actions
            .filter((a): a is CreateOneAction => a.kind === "create-one")
            .find((a) => a.alias === endpoint.target.alias)!;
          const actionChangeset = buildChangset(act.changeset, {
            input: validationResult,
          });
          console.log("Changeset result", actionChangeset);

          // FIXME run custom actions

          const id = await insertData(def, dbConn, endpoint, actionChangeset);

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
          const dbConn = getAppContext(req).dbConn;

          const pathParamVars = new Vars(extractPathParams(endpointPath, req.params));
          const contextVars = new Vars();
          let pids: number[] = [];
          // group context and target queries since all are findOne
          // FIXME implement "SELECT FOR UPDATE"
          const allQueries = [...queries.parentContextQueryTrees, queries.targetQueryTree];
          for (const qt of allQueries) {
            const results = await executeQueryTree(dbConn, def, qt, pathParamVars, pids);
            const result = findOne(results);
            contextVars.set(qt.alias, result);
            pids = [result.id];
          }

          const body = req.body;
          console.log("CTX PARAMS", pathParamVars);
          console.log("BODY", body);

          console.log("FIELDSET", endpoint.fieldset);

          const validationResult = await validateEndpointFieldset(endpoint.fieldset, body);
          console.log("Validation result", validationResult);

          // FIXME this is only temporary
          // find default changeset
          const act = endpoint.actions
            .filter((a): a is UpdateOneAction => a.kind === "update-one")
            .find((a) => a.alias === endpoint.target.alias)!;

          const actionChangeset = buildChangset(act.changeset, {
            input: validationResult,
          });

          const target = contextVars.get(endpoint.target.alias);
          const id = await updateData(def, dbConn, endpoint, target.id, actionChangeset);

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

  const requiresAuthentication = false; // TODO: read from endpoint

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
          const dbConn = getAppContext(req).dbConn;

          const pathParamVars = new Vars(extractPathParams(endpointPath, req.params));
          const contextVars = new Vars();

          let pids: number[] = [];
          // group context and target queries since all are findOne
          // FIXME implement "SELECT FOR UPDATE"
          const allQueries = [...queries.parentContextQueryTrees, queries.targetQueryTree];
          for (const qt of allQueries) {
            const results = await executeQueryTree(dbConn, def, qt, pathParamVars, pids);
            const result = findOne(results);
            contextVars.set(qt.alias, result);
            pids = [result.id];
          }

          const target = contextVars.get(endpoint.target.alias);
          await deleteData(def, dbConn, endpoint, target.id);

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
export function extractPathParams(path: EndpointPath, sourceMap: Record<string, string>): any {
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
  dbConn: DbConn,
  endpoint: EndpointDef,
  data: Record<string, unknown>
): Promise<number | null> {
  const target = endpoint.target;

  const { value: model } = getRef<"model">(definition, target.retType);

  // TODO: return action's `select` here
  const ret = await dbConn
    .insert(dataToFieldDbnames(model, data))
    .into(model.dbname)
    .returning("id");

  // FIXME findOne? handle unexpected result
  if (!ret.length) return null;
  return ret[0].id;
}

/** Update record in DB  */
async function updateData(
  definition: Definition,
  dbConn: DbConn,
  endpoint: EndpointDef,
  dataId: number,
  data: Record<string, unknown>
): Promise<number | null> {
  const target = endpoint.target;
  if (target == null) throw `Endpoint update target is empty`;

  const { value: model } = getRef<"model">(definition, target.retType);

  // TODO: return action's `select` here
  const ret = await dbConn(model.dbname)
    .where({ id: dataId })
    .update(dataToFieldDbnames(model, data))
    .returning("id");

  // FIXME findOne? handle unexpected result
  if (!ret.length) return null;
  return ret[0].id;
}

/** Delete record in DB  */
async function deleteData(
  definition: Definition,
  dbConn: DbConn,
  endpoint: EndpointDef,
  dataId: number
): Promise<void> {
  const target = endpoint.target;
  if (target == null) throw `Endpoint update target is empty`;

  const { value: model } = getRef<"model">(definition, target.retType);

  await dbConn(model.dbname).where({ id: dataId }).delete();
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
