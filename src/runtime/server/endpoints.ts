import { Express, Request, Response } from "express";
import _ from "lodash";
import { match } from "ts-pattern";

import { executeArithmetics } from "../common/arithmetics";
import {
  ReferenceIdResult,
  ValidReferenceIdResult,
  assignNoReferenceValidators,
  fetchReferenceIds,
} from "../common/constraintValidation";

import { Vars } from "./vars";

import {
  EndpointPath,
  PathFragmentIdentifier,
  PathQueryParameter,
  buildEndpointPath,
} from "@src/builder/query";
import { getRef } from "@src/common/refs";
import { assertUnreachable } from "@src/common/utils";
import { Logger } from "@src/logger";
import { executeEndpointActions } from "@src/runtime/common/action";
import { validateEndpointFieldset } from "@src/runtime/common/validation";
import { QueryTree } from "@src/runtime/query/build";
import { buildEndpointQueries } from "@src/runtime/query/endpointQueries";
import { executeQueryTree } from "@src/runtime/query/exec";
import { buildAuthenticationHandler } from "@src/runtime/server/authentication";
import { getAppContext } from "@src/runtime/server/context";
import { DbConn } from "@src/runtime/server/dbConn";
import { BusinessError, errorResponse } from "@src/runtime/server/error";
import { endpointGuardHandler } from "@src/runtime/server/middleware";
import { EndpointConfig } from "@src/runtime/server/types";
import {
  CreateEndpointDef,
  CustomManyEndpointDef,
  CustomOneEndpointDef,
  Definition,
  DeleteEndpointDef,
  EndpointDef,
  EndpointHttpMethod,
  EntrypointDef,
  GetEndpointDef,
  ListEndpointDef,
  TypedExprDef,
  TypedFunction,
  UpdateEndpointDef,
} from "@src/types/definition";

const logger = Logger.specific("http");

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
    endpointGuardHandler(async (req, resp, next) => {
      // we have to manually chain (await) our handlers since express' `next` can't do it for us (it's sync)
      for (const h of epConfig.handlers) {
        await h(req, resp, next);
      }
    })
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
    case "custom-one":
      return buildCustomOneEndpoint(def, endpoint);
    case "custom-many":
      return buildCustomManyEndpoint(def, endpoint);
  }
}

/** Create "get" endpoint handler from definition */
export function buildGetEndpoint(def: Definition, endpoint: GetEndpointDef): EndpointConfig {
  const endpointPath = buildEndpointPath(endpoint);
  const queries = buildEndpointQueries(def, endpoint);

  return {
    path: endpointPath.fullPath,
    method: "get",
    handlers: _.compact([
      // prehandlers
      buildAuthenticationHandler(def, { allowAnonymous: true }),
      // handler
      async (req: Request, resp: Response) => {
        let tx;
        try {
          logger.debug("AUTH INFO", req.user);
          tx = await getAppContext(req).dbConn.transaction();

          const pathParamVars = new Vars(extractPathParams(endpointPath, req.params));
          const contextVars = new Vars();

          if (queries.authQueryTree && req.user) {
            const results = await executeQueryTree(
              tx,
              def,
              queries.authQueryTree,
              new Vars({ id: req.user.userId }),
              []
            );
            const result = findOne(results);
            contextVars.set("@auth", result);
          }

          // group context and target queries since all are findOne
          const allQueries = [...queries.parentContextQueryTrees, queries.targetQueryTree];
          let pids: number[] = [];
          for (const qt of allQueries) {
            const results = await executeQueryTree(tx, def, qt, pathParamVars, pids);
            const result = findOne(results);
            contextVars.set(qt.alias, result);
            pids = [result.id];
          }

          await authorizeEndpoint(endpoint, contextVars);

          // FIXME run custom actions

          /* Refetch target object by id using the response query. We ignore `target.identifyWith` because
           * actions may have modified the record. We can only reliably identify it via `id` collected
           * before the actions were executed.
           */
          const targetId = contextVars.get(endpoint.target.alias, ["id"]);
          const responseResults = await executeQueryTree(
            tx,
            def,
            queries.responseQueryTree,
            pathParamVars,
            [targetId]
          );

          await tx.commit();

          resp.json(findOne(responseResults));
        } catch (err) {
          await tx?.rollback();

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
    handlers: _.compact([
      // prehandlers
      buildAuthenticationHandler(def, { allowAnonymous: true }),
      // handler
      async (req: Request, resp: Response) => {
        let tx;
        try {
          logger.debug("AUTH INFO", req.user);
          req.params;

          tx = await getAppContext(req).dbConn.transaction();

          const params = Object.assign({}, req.params, req.query);
          const pathParamVars = new Vars(extractPathParams(endpointPath, params));
          const contextVars = new Vars();

          if (queries.authQueryTree && req.user) {
            const results = await executeQueryTree(
              tx,
              def,
              queries.authQueryTree,
              new Vars({ id: req.user.userId }),
              []
            );
            const result = findOne(results);
            contextVars.set("@auth", result);
          }

          let pids: number[] = [];
          for (const qt of queries.parentContextQueryTrees) {
            const results = await executeQueryTree(tx, def, qt, pathParamVars, pids);
            const result = findOne(results);
            contextVars.set(qt.alias, result);
            pids = [result.id];
          }

          await authorizeEndpoint(endpoint, contextVars);

          // fetch target query (list, so no findOne here)
          const tQt = decorateListQuery(queries.targetQueryTree, pathParamVars);
          const results = await executeQueryTree(tx, def, tQt, pathParamVars, pids);
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
            tx,
            def,
            // repsonse query should fetch only by IDs but currently it doesn't so we have to decorate it as well
            decorateListQuery(queries.responseQueryTree, pathParamVars),
            pathParamVars,
            parentIds
          );

          await tx.commit();

          resp.json(responseResults);
        } catch (err) {
          await tx?.rollback();

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
    handlers: _.compact([
      // prehandlers
      buildAuthenticationHandler(def, { allowAnonymous: true }),
      // handler
      async (req: Request, resp: Response) => {
        let tx;
        try {
          logger.debug("AUTH INFO", req.user);
          tx = await getAppContext(req).dbConn.transaction();

          const pathParamVars = new Vars(extractPathParams(endpointPath, req.params));
          const contextVars = new Vars();

          if (queries.authQueryTree && req.user) {
            const results = await executeQueryTree(
              tx,
              def,
              queries.authQueryTree,
              new Vars({ id: req.user.userId }),
              []
            );
            const result = findOne(results);
            contextVars.set("@auth", result);
          }

          let pids: number[] = [];
          for (const qt of queries.parentContextQueryTrees) {
            const results = await executeQueryTree(tx, def, qt, pathParamVars, pids);
            const result = findOne(results);
            contextVars.set(qt.alias, result);
            pids = [result.id];
          }

          await authorizeEndpoint(endpoint, contextVars);

          const body = req.body;
          logger.debug("CTX PARAMS", pathParamVars);
          logger.debug("BODY", body);

          const referenceIds = await fetchReferenceIds(def, tx, endpoint.actions, body);
          assignNoReferenceValidators(endpoint.fieldset, referenceIds);
          const validationResult = await validateEndpointFieldset(def, endpoint.fieldset, body);
          logger.debug("Validation result", validationResult);

          await executeEndpointActions(
            def,
            tx,
            {
              input: validationResult,
              vars: contextVars,
              referenceIds,
            },
            { request: req, response: resp },
            endpoint.actions
          );

          const targetId = contextVars.get(endpoint.target.alias)?.id;

          if (!targetId) {
            throw new BusinessError("ERROR_CODE_SERVER_ERROR", "Insert failed");
          }
          logger.debug("Query result", targetId);

          // Refetch target object by id using the response query. We ignore `target.identifyWith` because
          // actions may have modified the record. We can only reliably identify it via ID collected before
          // actions were executed.
          const responseResults = await executeQueryTree(
            tx,
            def,
            queries.responseQueryTree,
            new Vars(),
            [targetId]
          );

          await tx.commit();

          resp.json(findOne(responseResults));
        } catch (err) {
          await tx?.rollback();

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
    handlers: _.compact([
      // prehandlers
      buildAuthenticationHandler(def, { allowAnonymous: true }),
      // handler
      async (req: Request, resp: Response) => {
        let tx;
        try {
          logger.debug("AUTH INFO", req.user);
          tx = await getAppContext(req).dbConn.transaction();

          const pathParamVars = new Vars(extractPathParams(endpointPath, req.params));
          const contextVars = new Vars();

          if (queries.authQueryTree && req.user) {
            const results = await executeQueryTree(
              tx,
              def,
              queries.authQueryTree,
              new Vars({ id: req.user.userId }),
              []
            );
            const result = findOne(results);
            contextVars.set("@auth", result);
          }

          // group context and target queries since all are findOne
          // FIXME implement "SELECT FOR UPDATE"
          let pids: number[] = [];
          const allQueries = [...queries.parentContextQueryTrees, queries.targetQueryTree];
          for (const qt of allQueries) {
            const results = await executeQueryTree(tx, def, qt, pathParamVars, pids);
            const result = findOne(results);
            contextVars.set(qt.alias, result);
            pids = [result.id];
          }

          await authorizeEndpoint(endpoint, contextVars);

          const body = req.body;
          logger.debug("CTX PARAMS", pathParamVars);
          logger.debug("BODY", body);

          logger.debug("FIELDSET", endpoint.fieldset);
          const referenceIds = await fetchReferenceIds(def, tx, endpoint.actions, body);
          assignNoReferenceValidators(endpoint.fieldset, referenceIds);
          const validationResult = await validateEndpointFieldset(def, endpoint.fieldset, body);
          logger.debug("Validation result", validationResult);

          await executeEndpointActions(
            def,
            tx,
            {
              input: validationResult,
              vars: contextVars,
              referenceIds,
            },
            { request: req, response: resp },
            endpoint.actions
          );

          const targetId = contextVars.get(endpoint.target.alias, ["id"]);

          if (targetId === null) {
            throw new BusinessError("ERROR_CODE_SERVER_ERROR", "Update failed");
          }
          logger.debug("Query result", targetId);

          /* Refetch target object by id using the response query. We ignore `target.identifyWith` because
           * actions may have modified the record. We can only reliably identify it via ID collected before
           * actions were executed.
           */
          const responseResults = await executeQueryTree(
            tx,
            def,
            queries.responseQueryTree,
            new Vars(),
            [targetId]
          );

          await tx.commit();

          resp.json(findOne(responseResults));
        } catch (err) {
          await tx?.rollback();

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
    handlers: _.compact([
      // prehandlers
      buildAuthenticationHandler(def, { allowAnonymous: true }),
      // handler
      async (req: Request, resp: Response) => {
        let tx;
        try {
          logger.debug("AUTH INFO", req.user);
          tx = await getAppContext(req).dbConn.transaction();

          const pathParamVars = new Vars(extractPathParams(endpointPath, req.params));
          const contextVars = new Vars();

          if (queries.authQueryTree && req.user) {
            const results = await executeQueryTree(
              tx,
              def,
              queries.authQueryTree,
              new Vars({ id: req.user.userId }),
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
            const results = await executeQueryTree(tx, def, qt, pathParamVars, pids);
            const result = findOne(results);
            contextVars.set(qt.alias, result);
            pids = [result.id];
          }

          await authorizeEndpoint(endpoint, contextVars);

          const target = contextVars.get(endpoint.target.alias);
          await deleteData(def, tx, endpoint, target.id);

          await tx.commit();

          resp.sendStatus(200);
        } catch (err) {
          await tx?.rollback();

          errorResponse(err);
        }
      },
    ]),
  };
}

/** Build "custom-one" endpoint handler from definition */
export function buildCustomOneEndpoint(
  def: Definition,
  endpoint: CustomOneEndpointDef
): EndpointConfig {
  const endpointPath = buildEndpointPath(endpoint);
  const queries = buildEndpointQueries(def, endpoint);

  return {
    path: endpointPath.fullPath,
    method: endpoint.method.toLowerCase() as Lowercase<EndpointHttpMethod>,
    handlers: _.compact([
      // prehandlers
      buildAuthenticationHandler(def, { allowAnonymous: true }),
      // handler
      async (req: Request, resp: Response) => {
        let tx;
        try {
          logger.debug("AUTH INFO", req.user);
          tx = await getAppContext(req).dbConn.transaction();

          const pathParamVars = new Vars(extractPathParams(endpointPath, req.params));
          const contextVars = new Vars();

          if (queries.authQueryTree && req.user) {
            const results = await executeQueryTree(
              tx,
              def,
              queries.authQueryTree,
              new Vars({ id: req.user.userId }),
              []
            );
            const result = findOne(results);
            contextVars.set("@auth", result);
          }

          // group context and target queries since all are findOne
          // FIXME implement "SELECT FOR UPDATE"
          let pids: number[] = [];
          const allQueries = [...queries.parentContextQueryTrees, queries.targetQueryTree];
          for (const qt of allQueries) {
            const results = await executeQueryTree(tx, def, qt, pathParamVars, pids);
            const result = findOne(results);
            contextVars.set(qt.alias, result);
            pids = [result.id];
          }

          await authorizeEndpoint(endpoint, contextVars);

          // --- run custom actions

          logger.debug("CTX PARAMS", pathParamVars);

          let validationResult: Record<string, unknown> = {};
          let referenceIds: ReferenceIdResult[] = [];
          logger.debug("FIELDSET", endpoint.fieldset);
          if (endpoint.fieldset != null) {
            const body = req.body;
            logger.debug("BODY", body);

            referenceIds = await fetchReferenceIds(def, tx, endpoint.actions, body);
            assignNoReferenceValidators(endpoint.fieldset, referenceIds);

            validationResult = await validateEndpointFieldset(def, endpoint.fieldset, body);
            logger.debug("Validation result", validationResult);
          }

          if (endpoint.actions.length > 0) {
            await executeEndpointActions(
              def,
              tx,
              {
                input: validationResult,
                vars: contextVars,
                referenceIds: referenceIds as ValidReferenceIdResult[],
              },
              { request: req, response: resp },
              endpoint.actions
            );
          }

          await tx.commit();

          if (endpoint.responds) {
            resp.sendStatus(204);
          }
        } catch (err) {
          await tx?.rollback();

          errorResponse(err);
        }
      },
    ]),
  };
}

/** Create "custom-many" endpoint handler from definition */
export function buildCustomManyEndpoint(
  def: Definition,
  endpoint: CustomManyEndpointDef
): EndpointConfig {
  const endpointPath = buildEndpointPath(endpoint);
  const queries = buildEndpointQueries(def, endpoint);

  return {
    path: endpointPath.fullPath,
    method: endpoint.method.toLowerCase() as Lowercase<EndpointHttpMethod>,
    handlers: _.compact([
      // prehandlers
      buildAuthenticationHandler(def, { allowAnonymous: true }),
      // handler
      async (req: Request, resp: Response) => {
        let tx;
        try {
          logger.debug("AUTH INFO", req.user);
          tx = await getAppContext(req).dbConn.transaction();

          const pathParamVars = new Vars(extractPathParams(endpointPath, req.params));
          const contextVars = new Vars();

          if (queries.authQueryTree && req.user) {
            const results = await executeQueryTree(
              tx,
              def,
              queries.authQueryTree,
              new Vars({ id: req.user.userId }),
              []
            );
            const result = findOne(results);

            contextVars.set("@auth", result);
          }

          let pids: number[] = [];
          for (const qt of queries.parentContextQueryTrees) {
            const results = await executeQueryTree(tx, def, qt, pathParamVars, pids);
            const result = findOne(results);
            contextVars.set(qt.alias, result);
            pids = [result.id];
          }

          // no target query here because this is endpoint has "many" cardinality, all we know are parents

          await authorizeEndpoint(endpoint, contextVars);

          // --- run custom actions

          logger.debug("CTX PARAMS", pathParamVars);

          let validationResult: Record<string, unknown> = {};
          let referenceIds: ReferenceIdResult[] = [];
          logger.debug("FIELDSET", endpoint.fieldset);
          if (endpoint.fieldset != null) {
            const body = req.body;
            logger.debug("BODY", body);

            referenceIds = await fetchReferenceIds(def, tx, endpoint.actions, body);
            assignNoReferenceValidators(endpoint.fieldset, referenceIds);

            validationResult = await validateEndpointFieldset(def, endpoint.fieldset, body);
            logger.debug("Validation result", validationResult);
          }

          if (endpoint.actions.length > 0) {
            await executeEndpointActions(
              def,
              tx,
              {
                input: validationResult,
                vars: contextVars,
                referenceIds: referenceIds as ValidReferenceIdResult[],
              },
              { request: req, response: resp },
              endpoint.actions
            );
          }

          await tx.commit();

          if (endpoint.responds) {
            resp.sendStatus(204);
          }
        } catch (err) {
          await tx?.rollback();

          errorResponse(err);
        }
      },
    ]),
  };
}

/**
 * Extract/filter only required props from source map (eg. from request params).
 */
export function extractPathParams(
  path: EndpointPath,
  sourceMap: Record<string, string>
): Record<string, string | number> {
  return _.chain(path.fragments)
    .filter(
      (frag): frag is PathFragmentIdentifier | PathQueryParameter =>
        frag.kind === "identifier" || frag.kind === "query"
    )
    .map((frag): [string, string | number] | undefined => {
      const val = validatePathIdentifier(frag, sourceMap[frag.name]);
      if (val == null) return;

      return [frag.name, val];
    })
    .compact()
    .fromPairs()
    .value();
}

/**
 * Validate and convert an input to a proper type based on definition.
 */
function validatePathIdentifier(
  fragment: PathFragmentIdentifier | PathQueryParameter,
  val: string
): string | number | undefined {
  try {
    return match(fragment)
      .with({ kind: "identifier" }, (f) => {
        return convertPathValue(val, f.type);
      })
      .with({ kind: "query" }, (f) => {
        const cVal = convertPathValue(val, f.type, f.defaultValue);
        if (cVal == null && f.required) {
          throw new Error(`Missing required URL parameter ${f.name}`);
        }
        return cVal;
      })
      .exhaustive();
  } catch (err: any) {
    throw new Error(`Invalid value for URL parameter "${fragment.name}": ${err.message ?? err}`);
  }
}

function convertPathValue(
  val: string,
  type: "text" | "integer",
  defaultValue?: string | number
): string | number {
  if (val == null && defaultValue != null) return defaultValue;

  switch (type) {
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

async function authorizeEndpoint(endpoint: EndpointDef, contextVars: Vars) {
  if (!endpoint.authorize) return;
  const authorizeResult = await executeTypedExpr(endpoint.authorize, contextVars);
  if (!authorizeResult) {
    throw new BusinessError("ERROR_CODE_UNAUTHORIZED", "Unauthorized");
  }
}

async function executeTypedExpr(expr: TypedExprDef, contextVars: Vars): Promise<unknown> {
  if (!expr) return null;

  switch (expr.kind) {
    case "alias": {
      // FIXME: cardinality
      // don't return undefined so user can compare to null, eg @auth.id is not null
      return _.castArray(contextVars.collect(expr.namePath))[0] ?? null;
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
async function executeTypedFunction(func: TypedFunction, contextVars: Vars): Promise<unknown> {
  async function getValue(expr: TypedExprDef) {
    return executeTypedExpr(expr, contextVars);
  }

  return executeArithmetics(func, getValue);
}

/**
 * Queries are built statically so we have decorate them according to runtime params.
 * This fn decorates list endpoint specific params
 *
 * Decorators:
 *  - limit/offset - adds paging params when they appear in params
 *  - search - TODO: list additional search filter
 */
function decorateListQuery(qt: QueryTree, params: Vars): QueryTree {
  // TODO: read var names from central place/config/...
  // use the same var names as when reading url params
  const limit = params.get("limit") ?? qt.query.limit;
  const offset = params.get("offset") ?? qt.query.offset;

  return {
    ...qt,
    query: {
      ...qt.query,

      // decorate with limit/offset
      limit,
      offset,
    },
  };
}
