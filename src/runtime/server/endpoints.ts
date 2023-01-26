import { Express, Request, Response } from "express";
import _, { compact } from "lodash";

import { assignNoReferenceValidators, fetchReferenceIds } from "../common/constraintValidation";

import { Vars } from "./vars";

import { EndpointPath, PathFragmentIdentifier, buildEndpointPath } from "@src/builder/query";
import { getRef } from "@src/common/refs";
import { assertUnreachable, ensureEqual } from "@src/common/utils";
import { executeActions } from "@src/runtime/common/action";
import { validateEndpointFieldset } from "@src/runtime/common/validation";
import { buildEndpointQueries } from "@src/runtime/query/endpointQueries";
import { executeQueryTree } from "@src/runtime/query/exec";
import { authenticationHandler } from "@src/runtime/server/authentication";
import { getAppContext } from "@src/runtime/server/context";
import { DbConn } from "@src/runtime/server/dbConn";
import { BusinessError, errorResponse } from "@src/runtime/server/error";
import { endpointGuardHandler } from "@src/runtime/server/middleware";
import { EndpointConfig } from "@src/runtime/server/types";
import {
  CreateEndpointDef,
  Definition,
  DeleteEndpointDef,
  EndpointDef,
  EntrypointDef,
  FunctionName,
  GetEndpointDef,
  ListEndpointDef,
  TypedExprDef,
  TypedFunction,
  UpdateEndpointDef,
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
  const queries = buildEndpointQueries(def, endpoint);

  return {
    path: endpointPath.fullPath,
    method: "get",
    handlers: compact([
      // prehandlers
      authenticationHandler(def, { allowAnonymous: true }),
      // handler
      async (req: Request, resp: Response) => {
        try {
          console.log("AUTH USER", req.user);
          const dbConn = getAppContext(req).dbConn;

          const pathParamVars = new Vars(extractPathParams(endpointPath, req.params));
          const contextVars = new Vars();

          if (queries.authQueryTree && req.user) {
            const results = await executeQueryTree(
              dbConn,
              def,
              queries.authQueryTree,
              new Vars({ base_id: req.user.base_id }),
              []
            );
            const result = findOne(results);
            contextVars.set("@auth", result);
          }

          // group context and target queries since all are findOne
          const allQueries = [...queries.parentContextQueryTrees, queries.targetQueryTree];
          let pids: number[] = [];
          for (const qt of allQueries) {
            const results = await executeQueryTree(dbConn, def, qt, pathParamVars, pids);
            const result = findOne(results);
            contextVars.set(qt.alias, result);
            pids = [result.id];
          }

          authorizeEndpoint(endpoint, contextVars);

          // FIXME run custom actions

          /* Refetch target object by id using the response query. We ignore `target.identifyWith` because
           * actions may have modified the record. We can only reliably identify it via `id` collected
           * before the actions were executed.
           */
          const targetId = contextVars.get(endpoint.target.alias, ["id"]);
          const responseResults = await executeQueryTree(
            dbConn,
            def,
            queries.responseQueryTree,
            pathParamVars,
            [targetId]
          );

          resp.json(findOne(responseResults));
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
  const queries = buildEndpointQueries(def, endpoint);

  return {
    path: endpointPath.fullPath,
    method: "get",
    handlers: compact([
      // prehandlers
      authenticationHandler(def, { allowAnonymous: true }),
      // handler
      async (req: Request, resp: Response) => {
        try {
          console.log("AUTH USER", req.user);
          const dbConn = getAppContext(req).dbConn;

          const pathParamVars = new Vars(extractPathParams(endpointPath, req.params));
          const contextVars = new Vars();

          if (queries.authQueryTree && req.user) {
            const results = await executeQueryTree(
              dbConn,
              def,
              queries.authQueryTree,
              new Vars({ base_id: req.user.base_id }),
              []
            );
            const result = findOne(results);
            contextVars.set("@auth", result);
          }

          let pids: number[] = [];
          for (const qt of queries.parentContextQueryTrees) {
            const results = await executeQueryTree(dbConn, def, qt, pathParamVars, pids);
            const result = findOne(results);
            contextVars.set(qt.alias, result);
            pids = [result.id];
          }

          authorizeEndpoint(endpoint, contextVars);

          // fetch target query (list, so no findOne here)
          const tQt = queries.targetQueryTree;
          const results = await executeQueryTree(dbConn, def, tQt, pathParamVars, pids);
          contextVars.set(tQt.alias, results);

          // FIXME run custom actions

          // After all actions are done, fetch the list of records again. Ignore contextVars
          // cache as custom actions may have modified the records.

          let parentIds: number[] = [];
          const parentTarget = _.last(endpoint.parentContext);
          if (parentTarget) {
            parentIds = _.castArray(contextVars.collect([parentTarget.alias, "id"]));
          }
          const responseResults = await executeQueryTree(
            dbConn,
            def,
            queries.responseQueryTree,
            pathParamVars,
            parentIds
          );

          resp.json(responseResults);
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
  const queries = buildEndpointQueries(def, endpoint);

  return {
    path: endpointPath.fullPath,
    method: "post",
    handlers: compact([
      // prehandlers
      authenticationHandler(def, { allowAnonymous: true }),
      // handler
      async (req: Request, resp: Response) => {
        try {
          console.log("AUTH USER", req.user);
          const dbConn = getAppContext(req).dbConn;

          const pathParamVars = new Vars(extractPathParams(endpointPath, req.params));
          const contextVars = new Vars();

          if (queries.authQueryTree && req.user) {
            const results = await executeQueryTree(
              dbConn,
              def,
              queries.authQueryTree,
              new Vars({ base_id: req.user.base_id }),
              []
            );
            const result = findOne(results);
            contextVars.set("@auth", result);
          }

          let pids: number[] = [];
          for (const qt of queries.parentContextQueryTrees) {
            const results = await executeQueryTree(dbConn, def, qt, pathParamVars, pids);
            const result = findOne(results);
            contextVars.set(qt.alias, result);
            pids = [result.id];
          }

          authorizeEndpoint(endpoint, contextVars);

          const body = req.body;
          console.log("CTX PARAMS", pathParamVars);
          console.log("BODY", body);

          const referenceIds = await fetchReferenceIds(def, dbConn, endpoint.actions, body);
          assignNoReferenceValidators(endpoint.fieldset, referenceIds);
          const validationResult = await validateEndpointFieldset(endpoint.fieldset, body);
          console.log("Validation result", validationResult);

          await executeActions(
            def,
            dbConn,
            { input: validationResult, vars: contextVars, referenceIds },
            endpoint.actions
          );

          const targetId = contextVars.get(endpoint.target.alias)?.id;

          if (!targetId) {
            throw new BusinessError("ERROR_CODE_SERVER_ERROR", "Insert failed");
          }
          console.log("Query result", targetId);

          // Refetch target object by id using the response query. We ignore `target.identifyWith` because
          // actions may have modified the record. We can only reliably identify it via ID collected before
          // actions were executed.
          const responseResults = await executeQueryTree(
            dbConn,
            def,
            queries.responseQueryTree,
            new Vars(),
            [targetId]
          );
          resp.json(findOne(responseResults));
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
  const queries = buildEndpointQueries(def, endpoint);

  return {
    path: endpointPath.fullPath,
    method: "patch",
    handlers: compact([
      // prehandlers
      authenticationHandler(def, { allowAnonymous: true }),
      // handler
      async (req: Request, resp: Response) => {
        try {
          console.log("AUTH USER", req.user);
          const dbConn = getAppContext(req).dbConn;

          const pathParamVars = new Vars(extractPathParams(endpointPath, req.params));
          const contextVars = new Vars();

          if (queries.authQueryTree && req.user) {
            const results = await executeQueryTree(
              dbConn,
              def,
              queries.authQueryTree,
              new Vars({ base_id: req.user.base_id }),
              []
            );
            const result = findOne(results);
            contextVars.set("@auth", result);
          }

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

          authorizeEndpoint(endpoint, contextVars);

          const body = req.body;
          console.log("CTX PARAMS", pathParamVars);
          console.log("BODY", body);

          console.log("FIELDSET", endpoint.fieldset);
          const referenceIds = await fetchReferenceIds(def, dbConn, endpoint.actions, body);
          assignNoReferenceValidators(endpoint.fieldset, referenceIds);
          const validationResult = await validateEndpointFieldset(endpoint.fieldset, body);
          console.log("Validation result", validationResult);

          await executeActions(
            def,
            dbConn,
            { input: validationResult, vars: contextVars, referenceIds },
            endpoint.actions
          );

          const targetId = contextVars.get(endpoint.target.alias, ["id"]);

          if (targetId === null) {
            throw new BusinessError("ERROR_CODE_SERVER_ERROR", "Update failed");
          }
          console.log("Query result", targetId);

          /* Refetch target object by id using the response query. We ignore `target.identifyWith` because
           * actions may have modified the record. We can only reliably identify it via ID collected before
           * actions were executed.
           */
          const responseResults = await executeQueryTree(
            dbConn,
            def,
            queries.responseQueryTree,
            new Vars(),
            [targetId]
          );
          resp.json(findOne(responseResults));
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
  const queries = buildEndpointQueries(def, endpoint);

  return {
    path: endpointPath.fullPath,
    method: "delete",
    handlers: compact([
      // prehandlers
      authenticationHandler(def, { allowAnonymous: true }),
      // handler
      async (req: Request, resp: Response) => {
        try {
          console.log("AUTH USER", req.user);
          const dbConn = getAppContext(req).dbConn;

          const pathParamVars = new Vars(extractPathParams(endpointPath, req.params));
          const contextVars = new Vars();

          if (queries.authQueryTree && req.user) {
            const results = await executeQueryTree(
              dbConn,
              def,
              queries.authQueryTree,
              new Vars({ base_id: req.user.base_id }),
              []
            );
            const result = findOne(results);
            contextVars.set("@auth", result);
          }

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

          authorizeEndpoint(endpoint, contextVars);

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

/**
 * Delete record in DB
 *
 * Move this together with other DB functions once "delete" actions are added
 */
async function deleteData(
  definition: Definition,
  dbConn: DbConn,
  endpoint: EndpointDef,
  dataId: number
): Promise<void> {
  const target = endpoint.target;
  if (target == null) throw `Endpoint update target is empty`;

  const model = getRef.model(definition, target.retType);

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
function authorizeEndpoint(endpoint: EndpointDef, contextVars: Vars) {
  if (!endpoint.authorize) return;
  const authorizeResult = executeTypedExpr(endpoint.authorize, contextVars);
  if (!authorizeResult) {
    throw new BusinessError("ERROR_CODE_UNAUTHORIZED", "Unauthorized");
  }
}

function executeTypedExpr(expr: TypedExprDef, contextVars: Vars): unknown {
  if (!expr) return null;

  switch (expr.kind) {
    case "alias": {
      // FIXME: cardinality
      return _.castArray(contextVars.collect(expr.namePath))[0];
    }
    case "function": {
      return executeTypedFunction(expr, contextVars);
    }
    case "literal": {
      return expr.value;
    }
    case "variable": {
      throw new Error(
        `Unexpected kind variable in runtime execution of expression, name: ${expr.name}`
      );
    }
    default: {
      return assertUnreachable(expr);
    }
  }
}
function executeTypedFunction(func: TypedFunction, contextVars: Vars): unknown {
  function getValue(expr: TypedExprDef) {
    return executeTypedExpr(expr, contextVars);
  }

  switch (func.name) {
    case "+":
    case "-":
    case "*":
    case "/":
    case ">":
    case "<":
    case ">=":
    case "<=": {
      ensureEqual(func.args.length, 2);
      const val1 = getValue(func.args[0]);
      const val2 = getValue(func.args[1]);

      return fnNameToFunction(func.name)(val1, val2);
    }
    case "and":
    case "or": {
      ensureEqual(func.args.length, 2);
      const val1 = getValue(func.args[0]);
      const val2 = getValue(func.args[1]);

      return fnNameToFunction(func.name)(val1, val2);
    }
    case "is":
    case "is not":
    case "in":
    case "not in": {
      ensureEqual(func.args.length, 2);
      const val1 = getValue(func.args[0]);
      const val2 = getValue(func.args[1]);

      return fnNameToFunction(func.name)(val1, val2);
    }
    case "concat": {
      const vals = func.args.map((arg) => {
        const value = getValue(arg);

        return value;
      });

      return fnNameToFunction(func.name)(vals);
    }
    case "length": {
      ensureEqual(func.args.length, 1);
      const val = getValue(func.args[0]);

      return fnNameToFunction(func.name)(val);
    }
    default: {
      return assertUnreachable(func.name);
    }
  }
}

function fnNameToFunction(name: FunctionName): (...args: any[]) => unknown {
  switch (name) {
    case "+":
      return _.add;
    case "-":
      return _.subtract;
    case "*":
      return _.multiply;
    case "/":
      return _.divide;
    case "<":
      return _.lt;
    case ">":
      return _.gt;
    case "<=":
      return _.lte;
    case ">=":
      return _.gte;
    case "is":
      return _.isEqual;
    case "is not":
      return (a: unknown, b: unknown) => !_.isEqual(a, b);
    case "and":
      return (a: unknown, b: unknown) => a && b;
    case "or":
      return (a: unknown, b: unknown) => a || b;
    case "in":
      return _.includes;
    case "not in":
      return (a: unknown[], v: unknown) => !_.includes(a, v);
    case "concat":
      return (a: unknown[]) => a.join("");
    case "length":
      return (value: string) => value.length;
    default:
      return assertUnreachable(name);
  }
}
