import _ from "lodash";

import { FilteredByKind } from "@src/common/kindFilter";
import { ensureEmpty, ensureEqual, ensureExists } from "@src/common/utils";
import { getTypeModel } from "@src/compiler/ast/type";
import { composeValidators, validateFieldType } from "@src/composer/models";
import { composeQuery } from "@src/composer/query";
import { getTypedLiteralValue, refKeyFromRef } from "@src/composer/utils";
import {
  ActionDef,
  ActionHookDef,
  ChangesetDef,
  ChangesetOperationDef,
  CreateOneAction,
  DeleteOneAction,
  ExecuteHookAction,
  FetchOneAction,
  FieldSetter,
  FunctionName,
  QueryDef,
  UpdateOneAction,
} from "@src/types/definition";
import * as Spec from "@src/types/specification";

/**
 * Composes the custom actions block for an endpoint. Adds a default action
 * based on `endpoint.kind` if one is not defined in blueprint.
 * Requires `targets` to construct an initial variable context.
 */
export function composeActionBlock(specs: Spec.Action[]): ActionDef[] {
  // Collect actions from the spec, updating the context during the pass through.
  const actions = specs.map((atom) => {
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
      case "fetch": {
        return composeFetchAction(atom);
      }
    }
  });

  return actions;
}

function composeDeleteAction(spec: FilteredByKind<Spec.Action, "delete">): DeleteOneAction {
  return {
    kind: "delete-one",
    targetPath: spec.targetPath.map((i) => i.text),
    model: findChangesetModel(spec.targetPath),
  };
}

function composeFetchAction(spec: FilteredByKind<Spec.Action, "fetch">): FetchOneAction {
  const changeset = spec.atoms.map((atom) => atomToChangesetOperation(atom, []));
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

function composeExecuteAction(spec: FilteredByKind<Spec.Action, "execute">): ExecuteHookAction {
  const changeset = spec.atoms.map((atom) => atomToChangesetOperation(atom, []));

  const actionHook: ActionHookDef = {
    args: spec.hook.args.map((arg) => ({
      name: arg.name,
      setter: setterToFieldSetter(arg),
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
function composeModelAction(spec: Spec.ModelAction): CreateOneAction | UpdateOneAction {
  const model = findChangesetModel(spec.targetPath);

  const changeset = spec.actionAtoms.map((atom) =>
    atomToChangesetOperation(atom, spec.isPrimary ? [] : [spec.alias])
  );

  // Build the desired `ActionDef`.
  return modelActionFromParts(spec, model, changeset);
}

function expandSetterExpression(expr: Spec.Expr): FieldSetter {
  switch (expr.kind) {
    case "literal": {
      return getTypedLiteralValue(expr.literal);
    }
    case "identifier": {
      const [head, ...tail] = expr.identifier;
      const access = tail.map((i) => i.text);
      if (head.ref.kind === "context") {
        switch (head.ref.contextKind) {
          case "virtualInput":
            return { kind: "changeset-reference", referenceName: head.text };
          case "authToken":
            return {
              kind: "request-auth-token",
              access: ["user", "token"],
            };
          default:
            return {
              kind: "reference-value",
              target: {
                alias: head.text,
                access,
              },
            };
        }
      }

      // if path has more than 1 element, it can't be a sibling call
      ensureEqual(access.length, 0, `Unresolved expression path: ${access}`);
      return { kind: "changeset-reference", referenceName: head.text };
    }
    case "function": {
      return {
        kind: "function",
        name: expr.name as FunctionName, // FIXME proper validation
        args: expr.args.map((a) => expandSetterExpression(a)),
      };
    }
  }
}

function setterToChangesetOperation(atom: Spec.ActionAtomSet): ChangesetOperationDef {
  return { name: atom.target.text, setter: setterToFieldSetter(atom.set) };
}

function setterToFieldSetter(set: Spec.ActionAtomSet["set"]): FieldSetter {
  switch (set.kind) {
    case "hook": {
      const args = set.hook.args.map((arg) => {
        const setter = setterToFieldSetter(arg);
        return { name: arg.name, setter };
      });
      return { kind: "fieldset-hook", hook: set.hook.code, args };
    }
    case "expression": {
      const exp = set.expr;
      return expandSetterExpression(exp);
    }
    case "query": {
      return { kind: "query", query: queryFromSpec(set.query) };
    }
  }
}

function atomToChangesetOperation(
  atom: Spec.ModelActionAtom,
  fieldsetNamespace: string[]
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
      const astType =
        atom.target.type.kind === "nullable" ? atom.target.type.type : atom.target.type;
      ensureEqual(astType.kind, "primitive");
      const type =
        astType.primitiveKind === "string"
          ? "text"
          : astType.primitiveKind === "float"
          ? "integer"
          : astType.primitiveKind;
      return {
        name: atom.target.text,
        setter: {
          kind: "fieldset-input",
          type,
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
      return setterToChangesetOperation(atom);
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
  const modelName = getTypeModel(specTargetPath.at(-1)?.type);
  if (!modelName) return getTypeModel(specTargetPath.at(-2)?.type)!;
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
