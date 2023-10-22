import _ from "lodash";

import { composeValidate } from "./validators";

import { FilteredByKind } from "@compiler/common/kindFilter";
import { initLogger } from "@compiler/common/logger";
import { ensureEmpty, ensureExists, resolveItems } from "@compiler/common/utils";
import { getTypeModel } from "@compiler/compiler/ast/type";
import { composeExpression, composeQuery } from "@compiler/composer/query";
import {
  ActionDef,
  ActionHookDef,
  ChangesetDef,
  ChangesetOperationDef,
  CreateOneAction,
  DeleteOneAction,
  ExecuteHookAction,
  QueryAction,
  QueryDef,
  RespondAction,
  TypedExprDef,
  UpdateOneAction,
  ValidateAction,
} from "@compiler/types/definition";
import * as Spec from "@compiler/types/specification";

const logger = initLogger("gaudi:compiler");
/**
 * Composes the custom actions block for an endpoint.
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
      setter: composeExpression(arg.expr, []),
      kind: "basic",
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
  const body = composeExpression(spec.body, []);
  const httpStatus = spec.httpStatus != null ? composeExpression(spec.httpStatus, []) : undefined;
  const httpHeaders = (spec.httpHeaders ?? []).map(({ name, value }) => ({
    name,
    value: composeExpression(value, []),
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
      const op = atomToChangesetOperation(atom, spec.isPrimary ? [] : [spec.alias]);
      // Add the changeset operation only if not added before
      if (!_.find(changeset, { name: op.name })) {
        changeset.push(op);
      }
    }
  );
  // handle error
  if (resolveResult.kind === "error") {
    logger.error(
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

// function expandSetterExpression(
//   expr: Spec.Expr<"code">,
//   verifySibling: (name: string) => void
// ): FieldSetter {
//   switch (expr.kind) {
//     case "literal": {
//       return { kind: "literal", literal: expr.literal };
//     }
//     case "identifier": {
//       const [head, ...tail] = expr.identifier;
//       const access = tail.map((i) => i.text);
//       switch (head.ref.kind) {
//         case "auth":
//         case "model":
//         case "queryTarget":
//         case "target":
//         case "action":
//         case "repeat":
//         case "struct": {
//           return {
//             kind: "reference-value",
//             target: {
//               alias: head.text,
//               access,
//             },
//           };
//         }
//         case "authToken": {
//           return {
//             kind: "request-auth-token",
//             access: ["user", "token"],
//           };
//         }
//         case "extraInput": {
//           // fixme fieldset-reference ??
//           return {
//             kind: "fieldset-input",
//             fieldsetAccess: [head.text],
//             required: head.ref.nullable,
//             type: head.ref.type,
//           };
//         }
//         case "modelAtom": {
//           // if path has more than 1 element, it can't be a sibling call
//           ensureEqual(access.length, 0, `Unexpected nested sibling ${head.text}: ${access}`);

//           // verify siblings in eg. action changeset
//           verifySibling(head.text);

//           return { kind: "changeset-reference", referenceName: head.text };
//         }
//         case "validator":
//           throw new Error("Unexpected validator ref in action");
//         case "validatorArg":
//           throw new Error("Unexpected validator arg ref in action");
//         default:
//           return assertUnreachable(head.ref);
//       }
//     }
//     case "array": {
//       return {
//         kind: "array",
//         elements: expr.elements.map((a) => expandSetterExpression(a, verifySibling)),
//       };
//     }
//     case "function": {
//       return {
//         kind: "function",
//         name: expr.name as FunctionName, // FIXME proper validation
//         args: expr.args.map((a) => expandSetterExpression(a, verifySibling)),
//       };
//     }
//     case "hook": {
//       throw new Error("TODO");
//     }
//   }
// }

function atomToChangesetOperation(
  atom: Spec.ModelActionAtom,
  fieldsetNamespace: string[]
): ChangesetOperationDef {
  switch (atom.kind) {
    case "input": {
      const setter: TypedExprDef = {
        kind: "alias-reference",
        source: "fieldset",
        path: [...fieldsetNamespace, atom.target.name],
      };
      return {
        kind: "input",
        fieldsetPath: [...fieldsetNamespace, atom.target.name],
        // FIXME validate
        validate: undefined,
        name: atom.target.name,
        setter: atom.default
          ? {
              kind: "function",
              name: "coalesce",
              args: [setter, composeExpression(atom.default, [])],
            }
          : setter,
      };
    }
    case "reference": {
      return {
        kind: "reference-through",
        through: atom.through.map((t) => t.name),
        fieldsetPath: [...fieldsetNamespace, atom.target.name],
        name: atom.target.name,
        setter: {
          kind: "alias-reference",
          source: "referenceThroughs",
          path: [...fieldsetNamespace, atom.target.name, "id"],
        },
      };
    }
    case "set": {
      return { kind: "basic", name: atom.target.name, setter: composeExpression(atom.expr, []) };
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
