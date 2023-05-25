import _ from "lodash";

import { FilteredByKind } from "@src/common/kindFilter";
import {
  assertUnreachable,
  ensureEmpty,
  ensureEqual,
  ensureExists,
  resolveItems,
} from "@src/common/utils";
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
  const changeset = spec.atoms.map((atom) => atomToChangesetOperation(atom, [], []));
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
  const changeset = spec.atoms.map((atom) => atomToChangesetOperation(atom, [], []));

  const actionHook: ActionHookDef = {
    args: spec.hook.args.map((arg) => ({
      name: arg.name,
      setter: setterToFieldSetter(arg, changeset),
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

  // TODO: this should be managed in resolver since it can be a circular reference which must be a compiler error
  const changeset: ChangesetDef = [];
  const resolveResult = resolveItems(
    // atoms to be resolved
    spec.actionAtoms,
    // item name resolver
    (atom) => {
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

function expandSetterExpression(expr: Spec.Expr, changeset: ChangesetDef): FieldSetter {
  switch (expr.kind) {
    case "literal": {
      return getTypedLiteralValue(expr.literal);
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
        case "virtualInput":
        case "modelAtom": {
          // if path has more than 1 element, it can't be a sibling call
          ensureEqual(access.length, 0, `Unexpected nested sibling ${head.text}: ${access}`);
          // check if sibling name is defined in the changeset
          const siblingOp = _.find(changeset, { name: head.text });
          if (siblingOp) {
            return { kind: "changeset-reference", referenceName: head.text };
          } else {
            throw new Error(`Circular reference: ${head.text}`);
          }
        }
        default:
          return assertUnreachable(head.ref);
      }
    }
    case "function": {
      return {
        kind: "function",
        name: expr.name as FunctionName, // FIXME proper validation
        args: expr.args.map((a) => expandSetterExpression(a, changeset)),
      };
    }
  }
}

function setterToChangesetOperation(
  atom: Spec.ActionAtomSet,
  changeset: ChangesetDef
): ChangesetOperationDef {
  return { name: atom.target.text, setter: setterToFieldSetter(atom.set, changeset) };
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
      return expandSetterExpression(exp, changeset);
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
