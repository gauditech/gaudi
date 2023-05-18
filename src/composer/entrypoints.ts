import _ from "lodash";

import { getRef, getTargetModel } from "@src/common/refs";
import { UnreachableError, assertUnreachable, ensureEqual } from "@src/common/utils";
import { RefModelField } from "@src/compiler/ast/ast";
import { composeActionBlock } from "@src/composer/actions";
import { composeExpression } from "@src/composer/query";
import { refKeyFromRef } from "@src/composer/utils";
import { uniqueNamePaths } from "@src/runtime/query/build";
import {
  ActionDef,
  Definition,
  DeleteOneAction,
  EndpointDef,
  EndpointHttpMethod,
  EntrypointDef,
  ExecuteHookAction,
  FieldSetter,
  FieldSetterReferenceValue,
  FieldsetDef,
  FieldsetFieldDef,
  ModelDef,
  QueryOrderByAtomDef,
  SelectDef,
  SelectItem,
  TargetDef,
  TargetWithSelectDef,
  TypedExprDef,
} from "@src/types/definition";
import * as Spec from "@src/types/specification";

export function composeEntrypoints(def: Definition, input: Spec.Entrypoint[]): void {
  def.entrypoints = input.map((spec) => processEntrypoint(def, spec, [], []));
}

function processEntrypoint(
  def: Definition,
  spec: Spec.Entrypoint,
  parentTargets: TargetDef[],
  parentNamePath: string[]
): EntrypointDef {
  const namePath = [...parentNamePath, spec.target.text];
  const target = calculateTarget(spec, namePath);
  const name = spec.name;

  const targets = [...parentTargets, target];

  return {
    name,
    target,
    endpoints: processEndpoints(def, targets, spec),
    entrypoints: spec.entrypoints.map((ispec) => processEntrypoint(def, ispec, targets, namePath)),
  };
}

export function calculateTarget(
  spec: Spec.Entrypoint | Spec.Populate,
  namePath: string[]
): TargetDef {
  const model = spec.target.ref.model;
  const identifyWith: TargetDef["identifyWith"] =
    "identifyThrough" in spec
      ? calculateIdentifyWith(spec.identifyThrough)
      : {
          name: "id",
          type: "integer",
          refKey: `${model}.id`,
          paramName: `${model.toLocaleLowerCase()}_id`,
        };

  return {
    kind: spec.target.ref.kind === "model" ? "model" : spec.target.ref.atomKind,
    name: spec.target.text,
    namePath,
    retType: model,
    identifyWith,
    alias: spec.alias.text,
  };
}

function calculateIdentifyWith(
  identifyThrough: Spec.IdentifierRef<RefModelField>
): TargetDef["identifyWith"] {
  const type = identifyThrough.type;
  if (
    type.kind !== "primitive" ||
    (type.primitiveKind !== "integer" && type.primitiveKind !== "string")
  ) {
    throw new Error(`Invalid type of identifiyWith ${JSON.stringify(type)}`);
  }
  return {
    name: identifyThrough.ref.name,
    type: type.primitiveKind === "string" ? "text" : type.primitiveKind,
    refKey: refKeyFromRef(identifyThrough.ref),
    paramName: `${identifyThrough.ref.parentModel.toLowerCase()}_${identifyThrough.ref.name}`,
  };
}

function processEndpoints(
  def: Definition,
  targets: TargetDef[],
  entrySpec: Spec.Entrypoint
): EndpointDef[] {
  const context = _.last(targets)!;

  return entrySpec.endpoints.map((endSpec): EndpointDef => {
    const rawActions = composeActionBlock(endSpec.actions);
    const actionDeps = collectActionDeps(def, rawActions);

    const actions = wrapActionsWithSelect(def, rawActions, actionDeps);
    const authorize = endSpec.authorize ? composeExpression(endSpec.authorize, []) : undefined;
    const authorizeDeps = collectAuthorizeDeps(def, authorize);
    const selectDeps = [...actionDeps, ...authorizeDeps];

    const targetsWithSelect = wrapTargetsWithSelect(def, targets, selectDeps);
    const parentContext = _.initial(targetsWithSelect);
    const target = _.last(targetsWithSelect)!;
    const authSelect = getAuthSelect(def, selectDeps);

    // should endpoint respond - only if something else (eg. action) does not send response before
    const respondingActions = actions.filter((a) => a.kind === "execute-hook" && a.responds);
    if (respondingActions.length > 0) {
      // only one
      ensureEqual(
        respondingActions.length,
        1,
        'At most one action in entrypoint can have "responds" attribute'
      );
    }
    const responds = respondingActions.length === 0; // check if there are actions that "respond", if no, then endpoint should respond

    switch (endSpec.kind) {
      case "get": {
        return {
          kind: "get",
          authSelect,
          authorize,
          response: processSelect(endSpec.response, context.namePath),
          // actions,
          parentContext,
          target,
        };
      }
      case "list": {
        return {
          kind: "list",
          authSelect,
          authorize,
          pageable: endSpec.pageable,
          response: processSelect(endSpec.response, context.namePath),
          // actions,
          parentContext,
          target: _.omit(target, "identifyWith"),
          orderBy: processOrderBy(context.namePath, endSpec.orderBy),
          filter: processFilter(context.namePath, endSpec.filter),
        };
      }
      case "create": {
        const fieldset = fieldsetFromActions(def, actions);
        return {
          kind: "create",
          fieldset,
          actions,
          parentContext,
          target: _.omit(target, "identifyWith"),
          authSelect,
          authorize,
          response: processSelect(endSpec.response, context.namePath),
        };
      }
      case "update": {
        const fieldset = fieldsetFromActions(def, actions);
        return {
          kind: "update",
          fieldset,
          actions,
          parentContext,
          target: _.first(wrapTargetsWithSelect(def, [target], selectDeps))!,
          authSelect,
          authorize,
          response: processSelect(endSpec.response, context.namePath),
        };
      }
      case "delete": {
        return {
          kind: "delete",
          actions,
          parentContext,
          target,
          authSelect,
          authorize,
          response: undefined,
        };
      }
      case "custom": {
        const fieldset = isMethodWithFieldset(endSpec.method)
          ? fieldsetFromActions(def, actions)
          : undefined;

        if (endSpec.cardinality === "one") {
          return {
            kind: "custom-one",
            method: endSpec.method,
            path: endSpec.path,
            actions,
            parentContext,
            target,
            authSelect,
            authorize,
            fieldset,
            response: undefined,
            responds,
          };
        } else {
          return {
            kind: "custom-many",
            method: endSpec.method,
            path: endSpec.path,
            actions,
            parentContext,
            target: _.omit(target, "identifyWith"),
            authSelect,
            authorize,
            fieldset,
            response: undefined,
            responds,
          };
        }
      }
      default: {
        assertUnreachable(endSpec);
      }
    }
  });
}

function isMethodWithFieldset(method: EndpointHttpMethod): boolean {
  switch (method) {
    case "GET":
    case "DELETE":
      return false;
    case "POST":
    case "PATCH":
      return true;
    default:
      assertUnreachable(method);
  }
}

export function processOrderBy(
  fromPath: string[],
  orderBy: Spec.QueryOrderBy[] | undefined
): QueryOrderByAtomDef[] | undefined {
  if (orderBy == null) return;

  return orderBy?.map(
    ({ field, order }): QueryOrderByAtomDef => ({
      exp: { kind: "alias", namePath: [...fromPath, ...field] },
      direction: order ?? "asc",
    })
  );
}

export function processFilter(
  fromPath: string[],
  filter: Spec.Expr | undefined
): TypedExprDef | undefined {
  return filter && composeExpression(filter, fromPath);
}

export function processSelect(select: Spec.Select, parentNamePath: string[]): SelectDef {
  return select.map((select): SelectItem => {
    const target = select.target;
    const namePath = [...parentNamePath, select.target.ref.name];

    switch (target.ref.atomKind) {
      case "field":
      case "computed":
        return {
          kind: target.ref.atomKind,
          refKey: refKeyFromRef(target.ref),
          name: target.ref.name,
          alias: target.text,
          namePath,
        };
      case "hook":
        return {
          kind: "model-hook",
          refKey: refKeyFromRef(target.ref),
          name: target.ref.name,
          alias: target.text,
          namePath,
        };
      case "reference":
      case "relation":
      case "query": {
        if (select.kind === "final") {
          return {
            kind: "aggregate",
            refKey: refKeyFromRef(target.ref),
            name: target.ref.name,
            alias: target.text,
            namePath,
          };
        } else {
          return {
            kind: target.ref.atomKind,
            name: target.ref.name,
            alias: target.text,
            namePath,
            select: processSelect(select.select, namePath),
          };
        }
      }
    }
  });
}

export function fieldsetFromActions(def: Definition, actions: ActionDef[]): FieldsetDef {
  const fieldsetWithPaths = actions
    // filter out actions without fieldset
    .filter((a): a is Exclude<ActionDef, DeleteOneAction> => a.kind !== "delete-one")
    .flatMap((action) => {
      return _.chain(action.changeset)
        .map(({ name, setter }): null | [string[], FieldsetFieldDef] => {
          switch (setter.kind) {
            case "fieldset-virtual-input": {
              return [
                setter.fieldsetAccess,
                {
                  kind: "field",
                  required: setter.required,
                  type: setter.type,
                  nullable: setter.nullable,
                  validators: setter.validators,
                },
              ];
            }
            case "fieldset-input": {
              if (action.kind === "execute-hook") {
                throw new UnreachableError(
                  `Hook action can't have "fieldset-input" because it doesn't operate on a model.`
                );
              }
              const field = getRef.field(def, `${action.model}.${name}`);
              return [
                setter.fieldsetAccess,
                {
                  kind: "field",
                  required: setter.required,
                  type: setter.type,
                  nullable: field.nullable,
                  validators: field.validators,
                },
              ];
            }
            case "fieldset-reference-input": {
              const field = getRef.field(def, setter.throughRefKey);
              return [
                setter.fieldsetAccess,
                {
                  kind: "field",
                  required: true, // FIXME
                  nullable: field.nullable,
                  type: field.type,
                  validators: field.validators,
                },
              ];
            }
            default:
              return null;
          }
        })
        .compact()
        .value();
    });

  return collectFieldsetPaths(fieldsetWithPaths);
}

/**
 * Converts a list of single `FieldsetFieldDef`s with their desired paths
 * into a `FieldsetDef` that nests `FieldsetRecordDef`s in order to respect
 * desired access path for each `FieldsetFieldDef`.ß
 */
function collectFieldsetPaths(paths: [string[], FieldsetFieldDef][]): FieldsetDef {
  const uniqueFieldsetPaths = _.uniqWith(paths, _.isEqual);

  const record = _.chain(uniqueFieldsetPaths)
    .map((p) => p[0][0])
    .uniq()
    .map((name) => {
      const relatedPaths = uniqueFieldsetPaths
        .filter((p) => p[0][0] === name)
        .map((p) => [_.tail(p[0]), p[1]] as [string[], FieldsetFieldDef]);
      if (relatedPaths.length === 1 && relatedPaths[0][0].length === 0) {
        // only a leaf node, return fieldset field
        return [name, relatedPaths[0][1]];
      } else if (relatedPaths.every((p) => p[0].length > 0)) {
        // OK, record without faulty leaf nodes
        return [name, collectFieldsetPaths(relatedPaths)];
      } else {
        // leaf node + non-empty node, this is not correct
        throw new Error(`Error in paths: ${paths.map((p) => p[0].join(".")).sort()}`);
      }
    })
    .fromPairs()
    .value();
  return { kind: "record", nullable: false, record };
}

type SelectDep = FieldSetterReferenceValue["target"];
/**
 * Iterates over actions in order to collect, for each of the actions and a default target
 * context variables, which fields are required in the following actions, so that they can
 * be fetched from the database beforehand.
 * Eg. if a `Repo` aliased as `myrepo` requires `myorg.id`, we need to instruct `myorg`
 * context variable to fetch the `id` so it can be referenced later by `myrepo`.
 */
export function collectActionDeps(def: Definition, actions: ActionDef[]): SelectDep[] {
  // collect all update paths
  const nonDeleteActions = actions.filter(
    (a): a is Exclude<ActionDef, DeleteOneAction> => a.kind !== "delete-one"
  );

  const targetPaths = _.chain(nonDeleteActions)
    .flatMap((a) => {
      switch (a.kind) {
        case "create-one": {
          // there's already a parent setter resolving this path, so we can skip it
          return null;
        }
        case "update-one": {
          try {
            // make sure we're not updating a model directly
            getRef.model(def, _.first(a.targetPath)!);
            return null;
          } catch (e) {
            // last item is what's being updated, we need to collect the id
            const [alias, ...access] = [...a.targetPath, "id"];
            return { alias, access };
          }
        }
      }
    })
    .compact()
    .value();

  // collect all targets

  function collectReferenceValues(setter: FieldSetter): FieldSetterReferenceValue[] {
    switch (setter.kind) {
      case "reference-value": {
        return [setter];
      }
      case "function": {
        return setter.args.flatMap((setter) => collectReferenceValues(setter));
      }
      case "fieldset-hook": {
        return setter.args.flatMap(({ setter }) => collectReferenceValues(setter));
      }
      default: {
        return [];
      }
    }
  }
  // --- collect changeset targets
  // action changeset
  const actionChangesets = nonDeleteActions.flatMap((a) => a.changeset);
  // hooks changeset
  const actionHookChangesets = _.chain(actions)
    .filter((a): a is ExecuteHookAction => a.kind === "execute-hook")
    .flatMap((a) => a.hook.args)
    .value();

  const changesets = [...actionChangesets, ...actionHookChangesets];
  const referenceValues = changesets.flatMap(({ setter }) => collectReferenceValues(setter));
  const setterTargets = referenceValues.map((rv) => rv.target);

  return [...setterTargets, ...targetPaths];
}

function collectAuthorizeDeps(def: Definition, expr: TypedExprDef): SelectDep[] {
  if (!expr) return [];
  switch (expr.kind) {
    case "alias": {
      const [alias, ...access] = expr.namePath;
      return [{ alias, access }];
    }
    case "literal": {
      return [];
    }
    case "variable": {
      return [];
    }
    case "function": {
      return expr.args.flatMap((arg) => collectAuthorizeDeps(def, arg));
    }
    default: {
      assertUnreachable(expr);
    }
  }
}

/**
 * Converts `TargetDef`s into `TargetWithSelectDef`s using select deps to resolve each target's `SelectDef`.
 */
function wrapTargetsWithSelect(
  def: Definition,
  targets: TargetDef[],
  deps: SelectDep[]
): TargetWithSelectDef[] {
  return targets.map((target) => {
    const targetPaths = uniqueNamePaths(
      deps.filter((dep) => dep.alias === target.alias).map((dep) => dep.access)
    );
    const targetModel = getRef.model(def, target.retType);
    const select = pathsToSelectDef(def, targetModel, targetPaths, target.namePath);
    return { ...target, select };
  });
}

/**
 * Inserts `ActionDef`s `select` property using select deps to resolve each target's `SelectDef`.
 * FIXME this is confusing because we don't have a special type for ActionDef with(out) select.
 * Prior to calling this function, every `ActionDef` has an empty (`[]`) select property.
 */
export function wrapActionsWithSelect(
  def: Definition,
  actions: ActionDef[],
  deps: SelectDep[]
): ActionDef[] {
  return actions.map((a): ActionDef => {
    if (a.kind === "delete-one" || a.kind === "execute-hook" || a.kind === "fetch-one") return a;

    const paths = uniqueNamePaths(deps.filter((d) => d.alias === a.alias).map((a) => a.access));
    const model = getRef.model(def, a.model);

    const select = pathsToSelectDef(def, model, paths, [a.alias]);
    return { ...a, select };
  });
}

function getAuthSelect(def: Definition, deps: SelectDep[]): SelectDef {
  if (!def.authenticator) return [];
  const paths = uniqueNamePaths(
    deps.filter((dep) => dep.alias === "@auth").map((dep) => dep.access)
  );
  const model = getRef.model(def, def.authenticator.authUserModel.refKey);
  return pathsToSelectDef(def, model, paths, [model.name]);
}

/**
 * Accepts a model, paths related to a model, model namespace in a query,
 * and constructs SelectDef for the paths given.
 */
function pathsToSelectDef(
  def: Definition,
  model: ModelDef,
  paths: string[][],
  namespace: string[]
): SelectDef {
  const direct = _.chain(paths)
    .map((p) => p[0])
    .uniq()
    .value();

  return direct.map((name): SelectItem => {
    // what is name?
    const ref = getRef(def, model.name, name, [
      "query",
      "reference",
      "relation",
      "field",
      "aggregate",
      "computed",
    ]);
    const relatedPaths = paths
      .filter((p) => p[0] === name)
      .map(_.tail)
      .filter((p) => p.length > 0);

    switch (ref.kind) {
      case "field":
      case "computed":
      case "aggregate": {
        // ensure the ref is the leaf of the path
        // For a path Org.name.foo.bar, example error would be:
        //   Org.name is a field, can't access foo.bar
        if (relatedPaths.length) {
          throw new Error(
            `Path ${[...namespace, name].join(".")} is a leaf, can't access ${relatedPaths.join(
              "."
            )}`
          );
        }
        return {
          kind: ref.kind,
          alias: name,
          name,
          refKey: ref.refKey,
          namePath: [...namespace, name],
        };
      }
      default: {
        const newModel = getTargetModel(def, ref.refKey);
        return {
          kind: ref.kind,
          alias: name,
          name,
          namePath: [...namespace, name],
          select: pathsToSelectDef(def, newModel, relatedPaths, [...namespace, name]),
        };
      }
    }
  });
}
