import _ from "lodash";

import { FilteredByKind } from "@src/common/kindFilter";
import { getRef } from "@src/common/refs";
import {
  UnreachableError,
  assertUnreachable,
  ensureEmpty,
  ensureEqual,
  ensureExists,
  ensureNot,
  resolveItems,
} from "@src/common/utils";
import { getTypeModel } from "@src/compiler/ast/type";
import { composeValidators, validateFieldType } from "@src/composer/models";
import { composeQuery } from "@src/composer/query";
import {
  VarContext,
  getTypedIterator,
  getTypedLiteralValue,
  getTypedPathWithLeaf,
  getTypedRequestPath,
  refKeyFromRef,
} from "@src/composer/utils";
import {
  ActionDef,
  ActionHookDef,
  ChangesetDef,
  ChangesetOperationDef,
  CreateOneAction,
  Definition,
  DeleteOneAction,
  EndpointType,
  ExecuteHookAction,
  FetchOneAction,
  FieldSetter,
  FunctionName,
  ModelDef,
  QueryDef,
  TargetDef,
  UpdateOneAction,
} from "@src/types/definition";
import * as Spec from "@src/types/specification";

/**
 * Composes the custom actions block for an endpoint. Adds a default action
 * based on `endpoint.kind` if one is not defined in blueprint.
 * Requires `targets` to construct an initial variable context.
 */
export function composeActionBlock(
  def: Definition,
  specs: Spec.Action[],
  targets: TargetDef[],
  endpointKind: EndpointType,
  /*
   * NOTE: `iteratorCtx` is used by populator only
   * TODO we should add support for iterators in actions
   */
  iteratorCtx: VarContext = {}
): ActionDef[] {
  const targetsCtx = getInitialContext(def, targets, endpointKind);
  const initialCtx = _.merge(targetsCtx, iteratorCtx);

  // Collect actions from the spec, updating the context during the pass through.
  const [_ctx, actions] = specs.reduce(
    (acc, atom) => {
      const [currentCtx, actions] = acc;
      switch (atom.kind) {
        case "create":
        case "update": {
          const action = composeModelAction(def, atom, currentCtx);
          currentCtx[action.alias] = { kind: "record", modelName: action.model };
          return [currentCtx, [...actions, action]];
        }
        case "delete": {
          const action = composeDeleteAction(def, atom);
          // FIXME delete an alias from `currentCtx`
          return [currentCtx, [...actions, action]];
        }
        case "execute": {
          const action = composeExecuteAction(def, atom, currentCtx);
          return [currentCtx, [...actions, action]];
        }
        case "fetch": {
          const action = composeFetchAction(def, atom, currentCtx);
          currentCtx[action.alias] = { kind: "record", modelName: action.model };
          return [currentCtx, [...actions, action]];
        }
      }
    },
    [initialCtx, []] as [VarContext, ActionDef[]]
  );

  return actions;
}

/**
 * Calculates initial context variables available in the endpoint, based on `TargetDef`s and
 * endpoint kind. For example, `create` endpoints don't see their own target in the context
 * until it's created by an action, while `update` sees is immediately, as it already exists
 * in the database.
 */
export function getInitialContext(
  def: Definition,
  targets: TargetDef[],
  endpointKind: EndpointType
): VarContext {
  const parentContext: VarContext = _.fromPairs(
    _.initial(targets).map((t): [string, VarContext[string]] => [
      t.alias,
      { kind: "record", modelName: t.retType },
    ])
  );

  if (def.authenticator) {
    parentContext["@auth"] = {
      kind: "record",
      modelName: def.authenticator.authUserModel.name,
    };
    parentContext["@requestAuthToken"] = {
      kind: "requestAuthToken",
    };
  }

  switch (endpointKind) {
    case "create":
    case "list":
    case "custom-many": {
      return parentContext;
    }
    case "update":
    case "delete":
    case "get":
    case "custom-one": {
      const thisTarget = _.last(targets)!;
      return {
        ...parentContext,
        [thisTarget.alias]: { kind: "record", modelName: thisTarget.retType },
      };
    }
  }
}

function composeDeleteAction(
  def: Definition,
  spec: FilteredByKind<Spec.Action, "delete">
): DeleteOneAction {
  return {
    kind: "delete-one",
    targetPath: spec.targetPath.map((i) => i.text),
    model: findChangesetModel(def, spec.targetPath).refKey,
  };
}

function composeFetchAction(
  def: Definition,
  spec: FilteredByKind<Spec.Action, "fetch">,
  ctx: VarContext
): FetchOneAction {
  const changeset: ChangesetDef = [];

  ensureExists(spec.alias, `Alias is required in fetch actions`);

  spec.atoms.forEach((atom) => {
    const op = atomToChangesetOperation(def, atom, [], null, ctx, changeset);
    changeset.push(op);
  });
  // fetch action's model is derived from it's query
  const query = composeQuery(spec.query);
  return {
    kind: "fetch-one",
    alias: spec.alias,
    changeset,
    model: query.retType,
    query: query,
  };
}

function composeExecuteAction(
  def: Definition,
  spec: FilteredByKind<Spec.Action, "execute">,
  ctx: VarContext
): ExecuteHookAction {
  const changeset: ChangesetDef = [];

  spec.atoms.forEach((atom) => {
    const op = atomToChangesetOperation(def, atom, [], null, ctx, changeset);
    changeset.push(op);
  });

  const actionHook: ActionHookDef = {
    args: spec.hook.args.map((arg) => ({
      name: arg.name,
      setter: setterToFieldSetter(def, arg, ctx, changeset),
    })),
    hook: spec.hook.code,
  };

  return {
    kind: "execute-hook",
    hook: actionHook,
    changeset,
    responds: spec.responds,
  };
}

/**
 * Composes a single `ActionDef` based on current variable context, entrypoint, endpoint and action specs.
 */
function composeModelAction(
  def: Definition,
  spec: Spec.ModelAction,
  ctx: VarContext
): CreateOneAction | UpdateOneAction {
  const model = findChangesetModel(def, spec.targetPath);

  const changeset: ChangesetDef = [];
  const resolveResult = resolveItems(
    // atoms to be resolved
    spec.actionAtoms,
    // item name resolver
    (atom: Spec.ModelActionAtom) => {
      console.dir(atom, { depth: 20 });
      switch (atom.kind) {
        case "input":
          return atom.target.text;
        case "reference":
          return atom.target.text;
        case "set":
          return atom.target.text;
        case "virtual-input":
          return atom.name;
      }
    },
    // item resolver
    (atom) => {
      const op = atomToChangesetOperation(
        def,
        atom,
        spec.isPrimary ? [] : [spec.alias],
        model,
        ctx,
        changeset
      );
      // Add the changeset operation only if not added before
      if (!_.find(changeset, { name: op.name })) {
        changeset.push(op);
      }
    }
  );
  // handle error
  if (resolveResult.kind === "error") {
    console.log(
      "ERRORS",
      resolveResult.errors.map((e) => `${e.name} [${e.error.message ?? e.error}]`)
    );

    throw new Error(
      `Couldn't resolve all field setters: ${resolveResult.errors.map((i) => i.name).join()}`
    );
  }

  // TODO: resolving should break on any error other than "not yet resolved"
  // TODO ensure changeset has covered every non-optional field in the model!

  // Build the desired `ActionDef`.
  return modelActionFromParts(spec, model, changeset);
}

function expandSetterExpression(
  def: Definition,
  expr: Spec.Expr,
  ctx: VarContext,
  changeset: ChangesetDef
): FieldSetter {
  switch (expr.kind) {
    case "literal": {
      return getTypedLiteralValue(expr.literal);
    }
    case "identifier": {
      const path = expr.identifier.map((i) => i.text);

      // is path alias in the context?
      if (path[0] in ctx) {
        const alias = path[0];
        const ctxVar = ctx[alias]!;
        switch (ctxVar.kind) {
          case "iterator": {
            const iterator = getTypedIterator(def, path, ctx);
            return {
              kind: "reference-value",
              target: {
                alias: iterator.name,
                access: _.compact([iterator.leaf]),
              },
            };
          }
          case "requestAuthToken": {
            const request = getTypedRequestPath(path, ctx);
            return {
              kind: request.kind,
              access: request.access,
            };
          }
          case "record": {
            const typedPath = getTypedPathWithLeaf(def, path, ctx);
            const namePath = typedPath.nodes.map((p) => p.name);
            const access = [...namePath, typedPath.leaf.name];
            return {
              kind: "reference-value",
              target: { alias: path[0], access },
            };
          }
          case "changeset-value": {
            throw new UnreachableError(
              `Changeset context shouldn't be accessed through identifier`
            );
          }
          default: {
            return assertUnreachable(ctxVar);
          }
        }
      } else {
        // FIXME sibling call should be a qualified form
        // if path has more than 1 element, it can't be a sibling call
        ensureEqual(path.length, 1, `Unresolved expression path ${path}`);
        const siblingName = path[0];
        // check if sibling name is defined in the changeset
        const siblingOp = _.find(changeset, { name: siblingName });
        if (siblingOp) {
          return { kind: "changeset-reference", referenceName: siblingName };
        } else {
          throw new Error(`Unresolved expression path: ${path}`);
        }
      }
    }
    case "function": {
      return {
        kind: "function",
        name: expr.name as FunctionName, // FIXME proper validation
        args: expr.args.map((a) => expandSetterExpression(def, a, ctx, changeset)),
      };
    }
  }
}

function setterToChangesetOperation(
  def: Definition,
  atom: Spec.ActionAtomSet,
  ctx: VarContext,
  changeset: ChangesetDef
): ChangesetOperationDef {
  return { name: atom.target.text, setter: setterToFieldSetter(def, atom.set, ctx, changeset) };
}

function setterToFieldSetter(
  def: Definition,
  set: Spec.ActionAtomSet["set"],
  ctx: VarContext,
  changeset: ChangesetDef
): FieldSetter {
  switch (set.kind) {
    case "hook": {
      const args = set.hook.args.map((arg) => {
        const setter = setterToFieldSetter(def, arg, ctx, changeset);
        return { name: arg.name, setter };
      });
      return { kind: "fieldset-hook", hook: set.hook.code, args };
    }
    case "expression": {
      const exp = set.expr;
      return expandSetterExpression(def, exp, ctx, changeset);
    }
    case "query": {
      return { kind: "query", query: queryFromSpec(set.query) };
    }
  }
}

function atomToChangesetOperation(
  def: Definition,
  atom: Spec.ModelActionAtom,
  fieldsetNamespace: string[],
  model: ModelDef | null,
  ctx: VarContext,
  changeset: ChangesetDef
): ChangesetOperationDef {
  switch (atom.kind) {
    case "virtual-input": {
      return {
        name: atom.name,
        setter: {
          kind: "fieldset-virtual-input",
          type: validateFieldType(atom.type),
          required: !atom.optional,
          nullable: atom.nullable,
          fieldsetAccess: [...fieldsetNamespace, atom.name],
          validators: composeValidators(validateFieldType(atom.type), atom.validators),
        },
      };
    }
    case "input": {
      ensureNot(model, null, `input atom can't be used with actions without target model`);
      const field = getRef.field(def, model.name, atom.target.text);
      return {
        name: atom.target.text,
        setter: {
          kind: "fieldset-input",
          type: field.type,
          required: !atom.optional,
          fieldsetAccess: [...fieldsetNamespace, atom.target.text],
        },
      };
    }
    case "reference": {
      return {
        name: atom.target.text,
        setter: {
          kind: "fieldset-reference-input",
          throughRefKey: refKeyFromRef(atom.through.ref),
          fieldsetAccess: [...fieldsetNamespace, `${atom.target.text}_${atom.through.text}`],
        },
      };
    }
    case "set": {
      return setterToChangesetOperation(def, atom, ctx, changeset);
    }
  }
}

/**
 * Returns a model the changeset operates on. Taken from the end of the resolved path
 * which must not end with a `leaf`.
 *
 * FIXME this function is not specific to `changeset`, rename. This may be deprecated
 *       by proposed changes in `getTypedPathFromContext`.
 */
function findChangesetModel(def: Definition, specTargetPath: Spec.IdentifierRef[]): ModelDef {
  let modelName = getTypeModel(specTargetPath.at(-1)?.type);
  if (!modelName) modelName = getTypeModel(specTargetPath.at(-2)?.type)!;
  return getRef.model(def, modelName);
}

/**
 * Constructs an `ActionDef` for a model action.
 */
function modelActionFromParts(
  spec: Spec.ModelAction,
  model: ModelDef,
  changeset: ChangesetDef
): CreateOneAction | UpdateOneAction {
  switch (spec.kind) {
    case "create": {
      return {
        kind: "create-one",
        alias: spec.alias,
        changeset,
        targetPath: spec.targetPath.map((i) => i.text),
        model: model.name,
        select: [],
        isPrimary: spec.isPrimary,
      };
    }
    case "update": {
      // FIXME update-many when targetKind is model
      return {
        kind: "update-one",
        changeset,
        alias: spec.alias,
        targetPath: spec.targetPath.map((i) => i.text),
        model: model.name,
        filter: undefined,
        select: [],
        isPrimary: spec.isPrimary,
      };
    }
  }
}

export function queryFromSpec(qspec: Spec.Query): QueryDef {
  ensureEmpty(qspec.aggregate, "Aggregates are not yet supported in action queries");

  const pathPrefix = _.first(qspec.fromModel);
  ensureExists(pathPrefix, `Action query "fromModel" path is empty ${qspec.fromModel}`);

  return composeQuery(qspec);
}
