import { transformSelectPath } from "@gaudi/compiler/dist/common/query";
import { dataToFieldDbnames, getRef } from "@gaudi/compiler/dist/common/refs";
import { assertUnreachable, ensureExists } from "@gaudi/compiler/dist/common/utils";
import {
  ActionDef,
  CreateOneAction,
  Definition,
  UpdateOneAction,
} from "@gaudi/compiler/dist/types/definition";
import _ from "lodash";

import { applyFilterIdInContext, buildQueryTree, queryTreeFromParts } from "../query/build";
import { castToCardinality, createQueryExecutor, executeQueryTree } from "../query/exec";

import { ValidReferenceIdResult } from "./constraintValidation";

import { buildChangeset } from "@runtime/common/changeset";
import { HookActionContext, executeActionHook } from "@runtime/hooks";
import { DbConn } from "@runtime/server/dbConn";
import { HookError } from "@runtime/server/error";
import { Vars } from "@runtime/server/vars";

export type ActionContext = {
  input: Record<string, unknown>;
  vars: Vars;
  referenceIds: ValidReferenceIdResult[];
};

export async function executeEndpointActions(
  def: Definition,
  dbConn: DbConn,
  ctx: ActionContext,
  epCtx: HookActionContext,
  actions: ActionDef[]
) {
  //
  return _internalExecuteActions(def, dbConn, ctx, epCtx, actions);
}
export async function executeActions(
  def: Definition,
  dbConn: DbConn,
  ctx: ActionContext,
  actions: ActionDef[]
) {
  return _internalExecuteActions(def, dbConn, ctx, undefined, actions);
}
async function _internalExecuteActions(
  def: Definition,
  dbConn: DbConn,
  ctx: ActionContext,
  epCtx: HookActionContext | undefined,
  actions: ActionDef[]
) {
  const qx = createQueryExecutor(dbConn);

  for (const action of actions) {
    const actionKind = action.kind;
    if (actionKind === "create-one") {
      const model = getRef.model(def, action.model);
      const dbModel = model.dbname;

      const actionChangeset = await buildChangeset(def, qx, epCtx, action.changeset, ctx);
      const dbData = dataToFieldDbnames(model, actionChangeset);

      const id = await insertData(dbConn, dbModel, dbData);
      const deps = await fetchActionDeps(def, dbConn, action, id);
      deps && ctx.vars.set(action.alias, deps[0]);
    } else if (actionKind === "update-one") {
      const model = getRef.model(def, action.model);
      const dbModel = model.dbname;

      const actionChangeset = await buildChangeset(def, qx, epCtx, action.changeset, ctx);
      const dbData = dataToFieldDbnames(model, actionChangeset);

      const targetId = resolveTargetId(ctx, action.targetPath);

      const id = await updateData(dbConn, dbModel, dbData, targetId);
      const deps = await fetchActionDeps(def, dbConn, action, id);
      deps && ctx.vars.set(action.alias, deps[0]);
    } else if (actionKind === "delete-one") {
      const model = getRef.model(def, action.model);
      const dbModel = model.dbname;

      const targetId = resolveTargetId(ctx, action.targetPath);

      await deleteData(dbConn, dbModel, targetId);
    } else if (actionKind === "query") {
      const qt = buildQueryTree(def, action.query);
      // FIXME this ugly
      const varsObj = Object.fromEntries(
        Object.keys(ctx.input).map((k) => [`___changeset___${k}`, ctx.input[k]])
      );
      varsObj["___requestAuthToken"] = epCtx?.request.user?.token;

      const result = castToCardinality(
        await qx.executeQueryTree(def, qt, new Vars(varsObj), []),
        action.query.retCardinality
      );
      ctx.vars.set(action.alias, result);
    } else if (actionKind === "execute-hook") {
      ensureExists(epCtx, '"execute" actions can run only in endpoint context.');

      const argsChangeset = await buildChangeset(def, qx, epCtx, action.hook.args, ctx);

      try {
        const result = await executeActionHook(def, action.hook.hook, argsChangeset, epCtx);
        ctx.vars.set(action.alias, result);
      } catch (err) {
        throw new HookError(err);
      }
    } else if (actionKind == "respond") {
      ensureExists(epCtx, '"execute" actions can run only in endpoint context.');

      try {
        // construct changeset and resolve action parts
        const actionChangesetDef = _.compact([
          { name: "body", setter: action.body },
          action.httpStatus != null ? { name: "httpStatus", setter: action.httpStatus } : undefined,
        ]);
        const changeset = await buildChangeset(def, qx, epCtx, actionChangesetDef, ctx);
        // http headers are a separate changeset
        const httpHeadersChangesetDef = (action.httpHeaders ?? []).map((h) => ({
          name: h.name,
          setter: h.value,
        }));
        const httpHeadersChangeset = await buildChangeset(
          def,
          qx,
          epCtx,
          httpHeadersChangesetDef,
          ctx
        );

        const body = changeset.body;
        // we're forcing number cause our type system should've made sure that this resolves to appropriate type
        const httpResponseCode = (changeset.httpStatus ?? 200) as number;

        Object.entries(httpHeadersChangeset).forEach(([name, value]) => {
          // null - remove current header
          if (value == null) {
            epCtx.response.removeHeader(name);
          }
          // multiple header values
          else if (_.isArray(value)) {
            epCtx.response.set(name, value);
          }
          // single value
          else {
            // we're forcing value to `any` cause our type system should've made sure that this resolves to appropriate type
            epCtx.response.set(name, value as any);
          }
        });
        epCtx.response.status(httpResponseCode).json(body);
      } catch (err: any) {
        throw new Error(err);
      }
    } else if (actionKind === "validate") {
      throw new Error("Not implemented");
    } else {
      assertUnreachable(actionKind);
    }
  }
}

/**
 * Fetches the record targeted by action based on the actions `select` deps.
 */
async function fetchActionDeps(
  def: Definition,
  dbConn: DbConn,
  action: CreateOneAction | UpdateOneAction,
  id: number
): Promise<Record<string, unknown>[] | undefined> {
  if (!action.alias) return;
  // no need to fetch if only ID is requested
  if (action.select.findIndex((item) => item.alias !== "id") < 0) {
    return [{ id }];
  }
  const qt = queryTreeFromParts(
    def,
    action.alias,
    [action.model],
    applyFilterIdInContext([action.model]),
    transformSelectPath(action.select, [action.alias], [action.model])
  );
  return executeQueryTree(dbConn, def, qt, new Vars(), [id]);
}

function resolveTargetId(ctx: ActionContext, targetPath: string[]): number {
  // append "id" to the end of the target path and separate it from it's root
  // eg.
  // [org, repo, issue] -> [org, repo, issue, id] -> [org, [repo, issue, id]]
  const [rootTargetName, ...path] = [...targetPath, "id"];

  return ctx.vars.get(rootTargetName, path);
}

// ---------- DB functions

async function updateData(
  dbConn: DbConn,
  model: string,
  data: Record<string, unknown>,
  targetId: number
): Promise<number> {
  // avoid malformed query by skipping the update if no data is passed
  if (Object.keys(data).length === 0) {
    return targetId;
  }
  const ret = await dbConn(model).update(data).where({ id: targetId }).returning("id");
  return findOne(ret);
}

async function insertData(
  dbConn: DbConn,
  model: string,
  data: Record<string, unknown>
): Promise<number> {
  const ret = await dbConn.insert(data).into(model).returning("id");

  return findOne(ret);
}

async function deleteData(dbConn: DbConn, model: string, targetId: number): Promise<number> {
  const ret = await dbConn(model).delete().where({ id: targetId }).returning("id");

  return findOne(ret);
}

function findOne(rows: any[], message?: string) {
  if (rows.length === 0) {
    throw new Error(message ?? `Record not found`);
  }
  if (rows.length > 1) {
    throw new Error(`Unexpected error: multiple records found`);
  }

  return rows[0].id;
}
