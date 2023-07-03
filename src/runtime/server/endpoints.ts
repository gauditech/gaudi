import { Express, Request, Response } from "express";
import _ from "lodash";
import { match } from "ts-pattern";

import { Vars } from "./vars";

import {
  EndpointPath,
  PathFragmentIdentifier,
  PathQueryParameter,
  buildEndpointPath,
} from "@src/builder/query";
import { kindFilter } from "@src/common/kindFilter";
import { getRef } from "@src/common/refs";
import { assertUnreachable } from "@src/common/utils";
import { endpointUsesAuthentication } from "@src/composer/entrypoints";
import { Logger } from "@src/logger";
import { executeArithmetics } from "@src/runtime//common/arithmetics";
import { executeEndpointActions } from "@src/runtime/common/action";
import {
  ReferenceIdResult,
  ValidReferenceIdResult,
  assignNoReferenceValidators,
  fetchReferenceIds,
} from "@src/runtime/common/constraintValidation";
import { validateEndpointFieldset } from "@src/runtime/common/validation";
import { QueryTree } from "@src/runtime/query/build";
import {
  buildEndpointQueries,
  decorateWithFilter,
  decorateWithOrderBy,
  decorateWithPaging,
} from "@src/runtime/query/endpointQueries";
import { NestedRow, executeQuery, executeQueryTree } from "@src/runtime/query/exec";
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
  QueryDef,
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
  const epPath = pathPrefix + epConfig.path;
  logger.info(`registering endpoint: ${epConfig.method.toUpperCase()} ${epPath}`);

  app[epConfig.method](
    epPath,
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
      buildAuthenticationHandler(def),
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
            pids = [result[qt.queryIdAlias!] as number];
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
      buildAuthenticationHandler(def),
      // handler
      async (req: Request, resp: Response) => {
        let tx;
        try {
          logger.debug("AUTH INFO", req.user);

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
            pids = [result[qt.queryIdAlias!] as number];
          }

          await authorizeEndpoint(endpoint, contextVars);

          // TODO: this query is not doing anything at the time
          // fetch target query (list, so no findOne here)
          // const tQt = queries.targetQueryTree;
          // const results = await executeQueryTree(tx, def, tQt, pathParamVars, pids);
          // contextVars.set(tQt.alias, results);

          // FIXME run custom actions

          // After all actions are done, fetch the list of records again. Ignore contextVars
          // cache as custom actions may have modified the records.

          let parentIds: number[] = [];
          const parentTarget = _.last(endpoint.parentContext);
          if (parentTarget) {
            parentIds = _.castArray(contextVars.collect([parentTarget.alias, "id"]));
          }

          const responseResults = await createListEndpointResponse(
            tx,
            def,
            endpoint,
            queries.responseQueryTree,
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
      buildAuthenticationHandler(def),
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
            pids = [result[qt.queryIdAlias!] as number];
          }

          await authorizeEndpoint(endpoint, contextVars);
          logger.debug("CTX PARAMS", pathParamVars);

          let validationResult: Record<string, unknown> = {};
          let referenceIds: ReferenceIdResult[] = [];
          logger.debug("FIELDSET", endpoint.fieldset);
          if (endpoint.fieldset) {
            const body = req.body;
            logger.debug("BODY", body);

            referenceIds = await fetchReferenceIds(def, tx, endpoint.actions, body);
            logger.debug("Reference IDs", referenceIds);

            const fieldset = _.cloneDeep(endpoint.fieldset);
            assignNoReferenceValidators(fieldset, referenceIds);
            validationResult = await validateEndpointFieldset(def, fieldset, body);
            logger.debug("Validation result", validationResult);
          }

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

          const primaryAlias = kindFilter(endpoint.actions, "create-one").find(
            (a) => a.isPrimary
          )!.alias;
          const targetId = contextVars.get(primaryAlias)?.id;

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
      buildAuthenticationHandler(def),
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
            pids = [result[qt.queryIdAlias!] as number];
          }

          await authorizeEndpoint(endpoint, contextVars);

          logger.debug("CTX PARAMS", pathParamVars);

          let validationResult: Record<string, unknown> = {};
          let referenceIds: ReferenceIdResult[] = [];
          if (endpoint.fieldset) {
            const body = req.body;
            logger.debug("BODY", body);
            logger.debug("FIELDSET", endpoint.fieldset);
            referenceIds = await fetchReferenceIds(def, tx, endpoint.actions, body);
            logger.debug("Reference IDs", referenceIds);

            const fieldset = _.cloneDeep(endpoint.fieldset);
            assignNoReferenceValidators(fieldset, referenceIds);
            validationResult = await validateEndpointFieldset(def, fieldset, body);
            logger.debug("Validation result", validationResult);
          }

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

          const primaryAlias = kindFilter(endpoint.actions, "update-one").find(
            (a) => a.isPrimary
          )!.alias;
          const targetId = contextVars.get(primaryAlias, ["id"]);

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
      buildAuthenticationHandler(def),
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
            pids = [result[qt.queryIdAlias!] as number];
          }

          await authorizeEndpoint(endpoint, contextVars);

          const target = contextVars.get(endpoint.target.alias);
          await deleteData(def, tx, endpoint, target.id);

          await tx.commit();

          resp.sendStatus(204);
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
      buildAuthenticationHandler(def),
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
            pids = [result[qt.queryIdAlias!] as number];
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
            logger.debug("Reference IDs", referenceIds);

            const fieldset = _.cloneDeep(endpoint.fieldset);
            assignNoReferenceValidators(fieldset, referenceIds);
            validationResult = await validateEndpointFieldset(def, fieldset, body);
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
      buildAuthenticationHandler(def),
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
            pids = [result[qt.queryIdAlias!] as number];
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
            logger.debug("Reference IDs", referenceIds);
            const fieldset = _.cloneDeep(endpoint.fieldset);
            assignNoReferenceValidators(fieldset, referenceIds);
            validationResult = await validateEndpointFieldset(def, fieldset, body);
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
  return _.chain(kindFilter(path.fragments, "identifier", "query"))
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
  type: "string" | "integer",
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
    case "string": {
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
    // this can either be result unauthenticated or forbidden
    const isLoggedIn = contextVars.get("@auth") !== undefined;
    const hasAuthentication = endpointUsesAuthentication(endpoint);

    if (isLoggedIn) {
      // it has to be other authorization rules
      throw new BusinessError("ERROR_CODE_FORBIDDEN", "Unauthorized");
    } else {
      // not logged in, does it have authentication rules?
      if (hasAuthentication) {
        throw new BusinessError("ERROR_CODE_UNAUTHENTICATED", "Unauthenticated");
      } else {
        // logged in and no authorization rules - must be authorization rules
        throw new BusinessError("ERROR_CODE_FORBIDDEN", "Unauthorized");
      }
    }
  }
}

export async function executeTypedExpr(expr: TypedExprDef, contextVars: Vars): Promise<unknown> {
  if (!expr) return null;

  switch (expr.kind) {
    case "alias": {
      return contextVars.collect(expr.namePath) ?? null;
    }
    case "function": {
      return executeTypedFunction(expr, contextVars);
    }
    case "in-subquery":
    case "aggregate-function": {
      throw new Error(`Not implemented: ${expr.kind} is not supported in the runtime`);
    }
    case "literal": {
      return expr.literal.value;
    }
    case "variable": {
      throw new Error(
        `Unexpected kind variable in runtime execution of expression, name: ${expr.name}`
      );
    }
    case "array": {
      return expr.elements.map((e) => executeTypedExpr(e, contextVars));
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
 * Fetch list data and wrap it in a `ListReponse`.
 */
async function createListEndpointResponse(
  conn: DbConn,
  def: Definition,
  endpoint: ListEndpointDef,
  qt: QueryTree,
  params: Vars,
  contextIds: number[]
): Promise<PaginatedListResponse<NestedRow> | NestedRow[]> {
  let resultQuery: QueryTree = qt;

  // add order by
  resultQuery = decorateWithOrderBy(endpoint, resultQuery);
  // add filter
  resultQuery = decorateWithFilter(endpoint, resultQuery);

  // --- paged list
  if (endpoint.pageable) {
    // add paging
    resultQuery = decorateWithPaging(endpoint, resultQuery, {
      pageSize: params.get("pageSize"),
      page: params.get("page"),
    });

    // exec data query
    const data = await executeQueryTree(conn, def, resultQuery, params, contextIds);

    // exec count query
    // using query from original `qt` without any paging/ordering/...
    const query: QueryDef = {
      ...qt.query,
      select: [
        {
          kind: "expression",
          type: { kind: "integer", nullable: true },
          alias: "totalCount",
          expr: {
            kind: "function",
            name: "count" as any, // FIXME "count" is not supported here
            args: [{ kind: "literal", literal: { kind: "integer", value: 1 } }],
          },
        },
      ],
    };
    const total = await executeQuery(conn, def, query, params, contextIds);
    const totalCount = (findOne(total)["totalCount"] as number | null) ?? 0;

    // resolve paging data
    const pageSize = resultQuery.query.limit ?? 0;
    const page = pageSize > 0 ? Math.floor((resultQuery.query.offset ?? 0) / pageSize) + 1 : 1;
    const totalPages = Math.ceil(totalCount / pageSize);

    return {
      page,
      pageSize,
      totalPages,
      totalCount,
      data,
    };
  }
  // --- unpaged list (returns all data)
  else {
    // simply fetch all data
    return await executeQueryTree(conn, def, resultQuery, params, contextIds);
  }
}

type PaginatedListResponse<T = any> = {
  page: number;
  pageSize: number;
  totalPages: number;
  totalCount: number;
  data: T[];
};
