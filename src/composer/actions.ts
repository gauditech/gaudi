import _ from "lodash";

import { composeValidate } from "./validators";

import { FilteredByKind } from "@src/common/kindFilter";
import {
  assertUnreachable,
  ensureEmpty,
  ensureEqual,
  ensureExists,
  resolveItems,
} from "@src/common/utils";
import { getTypeModel } from "@src/compiler/ast/type";
import { composeQuery } from "@src/composer/query";
import {
  ActionDef,
  ActionHookDef,
  ChangesetDef,
  ChangesetOperationDef,
  CreateOneAction,
  DeleteOneAction,
  ExecuteHookAction,
  FieldSetter,
  FunctionName,
  QueryAction,
  QueryDef,
  RespondAction,
  UpdateOneAction,
  ValidateAction,
} from "@src/types/definition";
import * as Spec from "@src/types/specification";

/**
 * Composes the custom actions block for an endpoint. Adds a default action
 * based on `endpoint.kind` if one is not defined in blueprint.
 * Requires `targets` to construct an initial variable context.
 */
export function composeActionBlock(specs: Spec.Action[]): ActionDef[] {
  // Collect actions from the spec, updating the context during the pass through.
  return specs.map((atom) => {
    switch (atom.kind) {
      case "create":
      case "update": {
        return composeModelAction(atom);
      }
      case "delete": {
        return composeDeleteAction(atom);
      }
      case "execute": {
        return composeExecuteAction(atom);
      }
      case "respond": {
        return componseRespondAction(atom);
      }
      case "query": {
        return composeQueryAction(atom);
      }
      case "validate": {
        return composeValidateAction(atom);
      }
    }
  });
}

function composeDeleteAction(spec: FilteredByKind<Spec.Action, "delete">): DeleteOneAction {
  return {
    kind: "delete-one",
    targetPath: spec.targetPath.map((i) => i.text),
    model: findChangesetModel(spec.targetPath),
  };
}

function composeQueryAction(spec: FilteredByKind<Spec.Action, "query">): QueryAction {
  const query = composeQuery(spec.query);
  return {
    kind: "query",
    alias: spec.alias,
    model: query.retType,
    query: query,
  };
}

function composeValidateAction(spec: FilteredByKind<Spec.Action, "validate">): ValidateAction {
  return {
    kind: "validate",
    key: spec.key,
    validate: composeValidate(spec.validate),
  };
}

function composeExecuteAction(spec: FilteredByKind<Spec.Action, "execute">): ExecuteHookAction {
  const actionHook: ActionHookDef = {
    args: spec.hook.args.map((arg) => ({
      name: arg.name,
      setter: setterToFieldSetter(arg, []),
    })),
    hook: spec.hook.code,
  };

  return {
    kind: "execute-hook",
    alias: spec.alias,
    hook: actionHook,
    responds: spec.responds,
  };
}

function componseRespondAction(spec: FilteredByKind<Spec.Action, "respond">): RespondAction {
  const body = expandSetterExpression(spec.body, () => true);
  const httpStatus =
    spec.httpStatus != null ? expandSetterExpression(spec.httpStatus, () => true) : undefined;
  const httpHeaders = (spec.httpHeaders ?? []).map(({ name, value }) => ({
    name,
    value: expandSetterExpression(value, () => true),
  }));

  return {
    kind: "respond",
    body,
    httpStatus,
    httpHeaders,
  };
}

/**
 * Composes a single `ActionDef` based on current variable context, entrypoint, endpoint and action specs.
 */
function composeModelAction(spec: Spec.ModelAction): CreateOneAction | UpdateOneAction {
  const model = findChangesetModel(spec.targetPath);

  // TODO: this should be managed in resolver since it can be a circular reference which must be a compiler error
  const changeset: ChangesetDef = [];
  const resolveResult = resolveItems(
    // atoms to be resolved
    spec.actionAtoms,
    // item name resolver
    (atom) => atom.target.name,
    // item resolver
    (atom) => {
      const op = atomToChangesetOperation(atom, spec.isPrimary ? [] : [spec.alias], changeset);
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

  // Build the desired `ActionDef`.
  return modelActionFromParts(spec, model, changeset);
}

function expandSetterExpression(
  expr: Spec.Expr,
  verifySibling: (name: string) => void
): FieldSetter {
  switch (expr.kind) {
    case "literal": {
      return { kind: "literal", literal: expr.literal };
    }
    case "identifier": {
      const [head, ...tail] = expr.identifier;
      const access = tail.map((i) => i.text);
      switch (head.ref.kind) {
        case "auth":
        case "model":
        case "queryTarget":
        case "target":
        case "action":
        case "repeat":
        case "struct": {
          return {
            kind: "reference-value",
            target: {
              alias: head.text,
              access,
            },
          };
        }
        case "authToken": {
          return {
            kind: "request-auth-token",
            access: ["user", "token"],
          };
        }
        case "extraInput": {
          return {
            kind: "fieldset-input",
            fieldsetAccess: [head.text],
            required: head.ref.nullable,
            type: head.ref.type,
          };
        }
        case "modelAtom": {
          // if path has more than 1 element, it can't be a sibling call
          ensureEqual(access.length, 0, `Unexpected nested sibling ${head.text}: ${access}`);

          // verify siblings in eg. action changeset
          verifySibling(head.text);

          return { kind: "changeset-reference", referenceName: head.text };
        }
        case "validatorArg":
          throw new Error("Unexpected validator arg ref in action");
        default:
          return assertUnreachable(head.ref);
      }
    }
    case "array": {
      return {
        kind: "array",
        elements: expr.elements.map((a) => expandSetterExpression(a, verifySibling)),
      };
    }
    case "function": {
      return {
        kind: "function",
        name: expr.name as FunctionName, // FIXME proper validation
        args: expr.args.map((a) => expandSetterExpression(a, verifySibling)),
      };
    }
  }
}

function setterToChangesetOperation(
  atom: Spec.ActionAtomSet,
  changeset: ChangesetDef
): ChangesetOperationDef {
  return { name: atom.target.name, setter: setterToFieldSetter(atom.set, changeset) };
}

function setterToFieldSetter(
  set: Spec.ActionAtomSetHook | Spec.ActionAtomSetExp | Spec.ActionAtomSetQuery,
  changeset: ChangesetDef
): FieldSetter {
  switch (set.kind) {
    case "hook": {
      const args = set.hook.args.map((arg) => {
        const setter = setterToFieldSetter(arg, changeset);
        return { name: arg.name, setter };
      });
      return { kind: "fieldset-hook", hook: set.hook.code, args };
    }
    case "expression": {
      const exp = set.expr;
      return expandSetterExpression(exp, (name) => {
        const siblingOp = _.find(changeset, { name });
        if (!siblingOp) {
          throw new Error(`Circular reference: ${name}`);
        }
      });
    }
    case "query": {
      return { kind: "query", query: queryFromSpec(set.query) };
    }
  }
}

function atomToChangesetOperation(
  atom: Spec.ModelActionAtom,
  fieldsetNamespace: string[],
  changeset: ChangesetDef
): ChangesetOperationDef {
  switch (atom.kind) {
    case "input": {
      return {
        name: atom.target.name,
        setter: {
          kind: "fieldset-input",
          type: atom.target.type,
          required: !atom.optional,
          fieldsetAccess: [...fieldsetNamespace, atom.target.name],
        },
      };
    }
    case "reference": {
      return {
        name: atom.target.name,
        setter: {
          kind: "fieldset-reference-input",
          through: atom.through.map((r) => r.name),
          fieldsetAccess: [
            ...fieldsetNamespace,
            `${atom.target.name}_${atom.through.map((r) => r.name).join("_")}`,
          ],
        },
      };
    }
    case "set": {
      return setterToChangesetOperation(atom, changeset);
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
function findChangesetModel(specTargetPath: Spec.IdentifierRef[]): string {
  const modelName = getTypeModel(specTargetPath.at(-1)!.type);
  if (!modelName) return getTypeModel(specTargetPath.at(-2)!.type)!;
  return modelName;
}

/**
 * Constructs an `ActionDef` for a model action.
 */
function modelActionFromParts(
  spec: Spec.ModelAction,
  model: string,
  changeset: ChangesetDef
): CreateOneAction | UpdateOneAction {
  switch (spec.kind) {
    case "create": {
      return {
        kind: "create-one",
        alias: spec.alias,
        changeset,
        targetPath: spec.targetPath.map((i) => i.text),
        model,
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
        model,
        filter: undefined,
        select: [],
        isPrimary: spec.isPrimary,
      };
    }
  }
}

export function queryFromSpec(qspec: Spec.Query): QueryDef {
  ensureEmpty(qspec.aggregate, "Aggregates are not yet supported in action queries");

  const pathPrefix = _.first(qspec.from);
  ensureExists(pathPrefix, `Action query "fromModel" path is empty ${qspec.from}`);

  return composeQuery(qspec);
}
