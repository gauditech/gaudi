import { initLogger } from "@gaudi/compiler";
import {
  EndpointPath,
  PathFragmentIdentifier,
  PathQueryParameter,
  buildEndpointPath,
} from "@gaudi/compiler/dist/builder/query";
import { kindFilter } from "@gaudi/compiler/dist/common/kindFilter";
import { getRef } from "@gaudi/compiler/dist/common/refs";
import { UnreachableError, assertUnreachable } from "@gaudi/compiler/dist/common/utils";
import { endpointUsesAuthentication } from "@gaudi/compiler/dist/composer/entrypoints";
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
} from "@gaudi/compiler/dist/types/definition";
import { Request, Response } from "express";
import _ from "lodash";
import { match } from "ts-pattern";

import { RequestContext, Storage } from "./context";

import { executeArithmetics } from "@runtime//common/arithmetics";
import { executeEndpointActions } from "@runtime/common/action";
import {
  ReferenceIdResult,
  ValidReferenceIdResult,
  assignNoReferenceValidators,
  assignUniqueExistsValidators,
  fetchExistingUniqueValues,
  fetchReferenceIds,
} from "@runtime/common/constraintValidation";
import { validateEndpointFieldset } from "@runtime/common/validation";
import { QueryTree } from "@runtime/query/build";
import {
  EndpointQueries,
  buildEndpointQueries,
  decorateWithFilter,
  decorateWithOrderBy,
  decorateWithPaging,
} from "@runtime/query/endpointQueries";
import { NestedRow, executeQuery, executeQueryTree } from "@runtime/query/exec";
import { buildAuthenticationHandler } from "@runtime/server/authentication";
import { DbConn } from "@runtime/server/dbConn";
import { BusinessError, errorResponse } from "@runtime/server/error";
import { EndpointConfig } from "@runtime/server/types";

const logger = initLogger("gaudi:runtime");

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
          const reqCtx = new RequestContext(req, resp, endpointPath);
          await loadAuthIntoContext(def, reqCtx, queries);

          tx = await reqCtx._db.conn.transaction();

          // group context and target queries since all are findOne
          const allQueries = [...queries.parentContextQueryTrees, queries.targetQueryTree];
          let pids: number[] = [];
          for (const qt of allQueries) {
            const results = await executeQueryTree(tx, def, qt, reqCtx, pids);
            const result = findOne(results);
            _.set(reqCtx, qt.alias, result);
            pids = [result[qt.queryIdAlias!] as number];
          }

          await authorizeEndpoint(def, endpoint, reqCtx);

          // FIXME run custom actions

          /* Refetch target object by id using the response query. We ignore `target.identifyWith` because
           * actions may have modified the record. We can only reliably identify it via `id` collected
           * before the actions were executed.
           */
          const targetId = reqCtx.get([endpoint.target.alias, "id"]) as number;
          const responseResults = await executeQueryTree(
            tx,
            def,
            queries.responseQueryTree,
            reqCtx,
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
          const reqCtx = new RequestContext(req, resp, endpointPath);
          await loadAuthIntoContext(def, reqCtx, queries);

          tx = await reqCtx._db.conn.transaction();

          let pids: number[] = [];
          for (const qt of queries.parentContextQueryTrees) {
            const results = await executeQueryTree(tx, def, qt, reqCtx, pids);
            const result = findOne(results);
            reqCtx.set(["aliases", qt.alias], result);
            pids = [result[qt.queryIdAlias!] as number];
          }

          await authorizeEndpoint(def, endpoint, reqCtx);

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
            parentIds = reqCtx.collect([parentTarget.alias, "id"]) as number[];
          }

          const responseResults = await createListEndpointResponse(
            tx,
            def,
            endpoint,
            queries.responseQueryTree,
            reqCtx,
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
          const reqCtx = new RequestContext(req, resp, endpointPath);
          await loadAuthIntoContext(def, reqCtx, queries);

          tx = await reqCtx._db.conn.transaction();

          if (queries.authQueryTree && req.user) {
            const results = await executeQueryTree(
              tx,
              def,
              queries.authQueryTree,
              new Storage({ id: req.user.userId }),
              []
            );
            const result = findOne(results);
            reqCtx.set("@auth", result);
          }

          let pids: number[] = [];
          for (const qt of queries.parentContextQueryTrees) {
            const results = await executeQueryTree(tx, def, qt, reqCtx, pids);
            const result = findOne(results);
            reqCtx.set(["aliases", qt.alias], result);
            pids = [result[qt.queryIdAlias!] as number];
          }

          await authorizeEndpoint(def, endpoint, reqCtx);

          let validationResult: Record<string, unknown> = {};
          let referenceIds: ReferenceIdResult[] = [];
          let uniqueIds: ReferenceIdResult[] = [];

          if (endpoint.fieldset) {
            const body = req.body;
            logger.debug("BODY", body);

            referenceIds = await fetchReferenceIds(def, tx, endpoint.actions, body);
            logger.debug("Reference IDs", referenceIds);

            uniqueIds = await fetchExistingUniqueValues(
              def,
              tx,
              endpoint.actions,
              body,
              referenceIds
            );
            logger.debug("Unique IDs", uniqueIds);

            const fieldset = _.cloneDeep(endpoint.fieldset);
            assignNoReferenceValidators(fieldset, referenceIds);
            assignUniqueExistsValidators(fieldset, uniqueIds);
            validationResult = await validateEndpointFieldset(def, fieldset, body);
            logger.debug("Validation result", validationResult);
          }

          await executeEndpointActions(
            def,
            tx,
            {
              input: validationResult,
              requestContext: reqCtx,
              referenceIds: referenceIds as ValidReferenceIdResult[],
            },
            { request: req, response: resp },
            endpoint.actions
          );

          const primaryAlias = kindFilter(endpoint.actions, "create-one").find(
            (a) => a.isPrimary
          )!.alias;
          const targetId = reqCtx.get([primaryAlias, "id"]) as number | undefined;

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
            new Storage({}),
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
          const reqCtx = new RequestContext(req, resp, endpointPath);
          await loadAuthIntoContext(def, reqCtx, queries);

          tx = await reqCtx._db.conn.transaction();

          // group context and target queries since all are findOne
          // FIXME implement "SELECT FOR UPDATE"
          let pids: number[] = [];
          const allQueries = [...queries.parentContextQueryTrees, queries.targetQueryTree];
          for (const qt of allQueries) {
            const results = await executeQueryTree(tx, def, qt, reqCtx, pids);
            const result = findOne(results);
            reqCtx.set(["aliases", qt.alias], result);
            pids = [result[qt.queryIdAlias!] as number];
          }

          await authorizeEndpoint(def, endpoint, reqCtx);

          let validationResult: Record<string, unknown> = {};
          let referenceIds: ReferenceIdResult[] = [];
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
              requestContext: reqCtx,
              referenceIds: referenceIds as ValidReferenceIdResult[],
            },
            { request: req, response: resp },
            endpoint.actions
          );

          const primaryAlias = kindFilter(endpoint.actions, "update-one").find(
            (a) => a.isPrimary
          )!.alias;
          const targetId = reqCtx.get([primaryAlias, "id"]) as number | undefined;

          if (!targetId) {
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
            new Storage({}),
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
          const reqCtx = new RequestContext(req, resp, endpointPath);
          await loadAuthIntoContext(def, reqCtx, queries);

          tx = await reqCtx._db.conn.transaction();

          let pids: number[] = [];
          // group context and target queries since all are findOne
          // FIXME implement "SELECT FOR UPDATE"
          const allQueries = [...queries.parentContextQueryTrees, queries.targetQueryTree];
          for (const qt of allQueries) {
            const results = await executeQueryTree(tx, def, qt, reqCtx, pids);
            const result = findOne(results);
            reqCtx.set(["aliases", qt.alias], result);
            pids = [result[qt.queryIdAlias!] as number];
          }

          await authorizeEndpoint(def, endpoint, reqCtx);

          const targetId = reqCtx.get([endpoint.target.alias, "id"]) as number;
          await deleteData(def, tx, endpoint, targetId);

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
          const reqCtx = new RequestContext(req, resp, endpointPath);
          await loadAuthIntoContext(def, reqCtx, queries);

          tx = await reqCtx._db.conn.transaction();

          // group context and target queries since all are findOne
          // FIXME implement "SELECT FOR UPDATE"
          let pids: number[] = [];
          const allQueries = [...queries.parentContextQueryTrees, queries.targetQueryTree];
          for (const qt of allQueries) {
            const results = await executeQueryTree(tx, def, qt, reqCtx, pids);
            const result = findOne(results);
            reqCtx.set(["aliases", qt.alias], result);
            pids = [result[qt.queryIdAlias!] as number];
          }

          await authorizeEndpoint(def, endpoint, reqCtx);

          // --- run custom actions

          let validationResult: Record<string, unknown> = {};
          let referenceIds: ReferenceIdResult[] = [];
          logger.debug("FIELDSET %O", endpoint.fieldset);
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
                requestContext: reqCtx,
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
          const reqCtx = new RequestContext(req, resp, endpointPath);
          await loadAuthIntoContext(def, reqCtx, queries);

          tx = await reqCtx._db.conn.transaction();

          let pids: number[] = [];
          for (const qt of queries.parentContextQueryTrees) {
            const results = await executeQueryTree(tx, def, qt, reqCtx, pids);
            const result = findOne(results);
            reqCtx.set(["aliases", qt.alias], result);
            pids = [result[qt.queryIdAlias!] as number];
          }

          // no target query here because this is endpoint has "many" cardinality, all we know are parents

          await authorizeEndpoint(def, endpoint, reqCtx);

          // --- run custom actions

          let validationResult: Record<string, unknown> = {};
          let referenceIds: ReferenceIdResult[] = [];

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
                requestContext: reqCtx,
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

async function authorizeEndpoint(def: Definition, endpoint: EndpointDef, ctx: RequestContext) {
  if (!endpoint.authorize) return;

  const authorizeResult = await executeTypedExpr(def, endpoint.authorize, ctx);
  if (!authorizeResult) {
    // this can either be result unauthenticated or forbidden
    const isLoggedIn = _.get(ctx, ["@auth", "id"]) !== undefined;
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

export async function executeTypedExpr(
  def: Definition,
  expr: TypedExprDef,
  ctx: Storage
): Promise<unknown> {
  if (!expr) return null;

  switch (expr.kind) {
    case "alias-reference": {
      return ctx.collect(expr.source, ...expr.path) ?? null;
    }
    case "function": {
      return executeTypedFunction(def, expr, ctx);
    }
    case "in-subquery":
    case "aggregate-function": {
      throw new Error(`Not implemented: ${expr.kind} is not supported in the runtime`);
    }
    case "literal": {
      return expr.literal.value;
    }
    case "identifier-path": {
      return ctx.get("@currentContext", expr.namePath);
    }
    case "array": {
      return expr.elements.map((e) => executeTypedExpr(def, e, ctx));
    }
    case "hook": {
      throw new Error("Not implemented");
      // return executeActionHook(def, expr.hook.hook, expr.hook.args, {});
    }
    default: {
      return assertUnreachable(expr);
    }
  }
}
async function executeTypedFunction(
  def: Definition,
  func: TypedFunction,
  ctx: Storage
): Promise<unknown> {
  async function getValue(expr: TypedExprDef) {
    return executeTypedExpr(def, expr, ctx);
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
  ctx: RequestContext,
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
      pageSize: ctx.queryParams.pageSize as any, // FIXME
      page: ctx.queryParams.page as any, // FIXME
    });

    // exec data query
    const data = await executeQueryTree(conn, def, resultQuery, ctx, contextIds);

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
    const total = await executeQuery(conn, def, query, ctx, contextIds);
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
    return await executeQueryTree(conn, def, resultQuery, ctx, contextIds);
  }
}

type PaginatedListResponse<T = any> = {
  page: number;
  pageSize: number;
  totalPages: number;
  totalCount: number;
  data: T[];
};

export async function loadAuthIntoContext(
  def: Definition,
  ctx: RequestContext,
  queries: EndpointQueries
) {
  if (queries.authQueryTree && ctx._express.req.user) {
    const results = await executeQueryTree(
      ctx._db.conn,
      def,
      queries.authQueryTree,
      new Storage({ id: ctx._express.req.user.userId }),
      []
    );
    const result = findOne(results);
    ctx.set(["aliases", "@auth"], result);
  } else {
    ctx.set(["aliases", "@auth"], null);
  }
}
