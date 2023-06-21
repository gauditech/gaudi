import {
  applyFilterIdInContext,
  buildQueryTree,
  queryTreeFromParts,
  transformSelectPath,
} from "../query/build";
import { castToCardinality, createQueryExecutor, executeQueryTree } from "../query/exec";

import { ValidReferenceIdResult } from "./constraintValidation";

import { dataToFieldDbnames, getRef } from "@src/common/refs";
import { assertUnreachable, ensureExists } from "@src/common/utils";
import { buildChangeset } from "@src/runtime/common/changeset";
import { HookActionContext, executeActionHook } from "@src/runtime/hooks";
import { DbConn } from "@src/runtime/server/dbConn";
import { HookError } from "@src/runtime/server/error";
import { Vars } from "@src/runtime/server/vars";
import { ActionDef, CreateOneAction, Definition, UpdateOneAction } from "@src/types/definition";

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
      ensureExists(epCtx, 'Endpoint context is required for "execute" actions');

      const argsChangeset = await buildChangeset(def, qx, epCtx, action.hook.args, ctx);

      try {
        await executeActionHook(def, action.hook.hook, argsChangeset, epCtx);
      } catch (err) {
        throw new HookError(err);
      }
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
  id: number | null
): Promise<Record<string, unknown>[] | undefined> {
  if (!id) {
    throw new Error(`Failed to insert into ${action.model}`);
  }
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
): Promise<number | null> {
  // TODO: return action's `select` here
  const ret = await dbConn(model).update(data).where({ id: targetId }).returning("id");

  // FIXME findOne? handle unexpected result
  if (!ret.length) return null;
  return ret[0].id;
}

async function insertData(
  dbConn: DbConn,
  model: string,
  data: Record<string, unknown>
): Promise<number | null> {
  // TODO: return action's `select` here
  const ret = await dbConn.insert(data).into(model).returning("id");

  // FIXME findOne? handle unexpected result
  if (!ret.length) return null;
  return ret[0].id;
}

async function deleteData(dbConn: DbConn, model: string, targetId: number): Promise<number | null> {
  // TODO: return action's `select` here
  const ret = await dbConn(model).delete().where({ id: targetId }).returning("id");

  // FIXME findOne? handle unexpected result
  if (!ret.length) return null;
  return ret[0].id;
}
