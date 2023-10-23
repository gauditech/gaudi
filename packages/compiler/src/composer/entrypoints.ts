import _ from "lodash";
import { P, match } from "ts-pattern";

import { composeValidate } from "./validators";

import { buildEndpointPath } from "@compiler/builder/query";
import { kindFilter } from "@compiler/common/kindFilter";
import { transformSelectPath } from "@compiler/common/query";
import { getRef, getTargetModel } from "@compiler/common/refs";
import {
  UnreachableError,
  assertUnreachable,
  ensureEqual,
  ensureOneOf,
} from "@compiler/common/utils";
import { getTypeModel } from "@compiler/compiler/ast/type";
import { composeActionBlock } from "@compiler/composer/actions";
import { composeExpression, composeOrderBy, composeSelect } from "@compiler/composer/query";
import {
  ActionDef,
  ApiDef,
  Definition,
  EndpointDef,
  EntrypointDef,
  FieldsetDef,
  FieldsetFieldDef,
  FieldsetRecordDef,
  ModelDef,
  SelectDef,
  SelectItem,
  TargetDef,
  TargetWithSelectDef,
  TypedExprDef,
} from "@compiler/types/definition";
import * as Spec from "@compiler/types/specification";

export function composeApis(def: Definition, input: Spec.Api[]): void {
  def.apis = input.map<ApiDef>(({ name, entrypoints }) => ({
    name,
    path: "/api" + (name ? "/" + name.toLocaleLowerCase() : ""),
    entrypoints: composeEntrypoints(def, entrypoints),
  }));
}

export function composeEntrypoints(def: Definition, input: Spec.Entrypoint[]): EntrypointDef[] {
  return input.map((spec) => processEntrypoint(def, spec, [], []));
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
      ? calculateIdentifyWith(spec)
      : {
          path: ["id"],
          type: "integer",
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

function calculateIdentifyWith(spec: Spec.Entrypoint): TargetDef["identifyWith"] {
  if (!spec.identifyThrough) return undefined;
  const leaf = _.last(spec.identifyThrough)!;
  ensureEqual(leaf.ref.kind, "modelAtom");
  ensureEqual(leaf.ref.atomKind, "field");
  ensureOneOf(leaf.ref.type, ["string", "integer"]);
  const path = spec.identifyThrough.map((i) => i.text);
  const paramName = [
    // include current model and append identifyThrough path
    spec.model.toLowerCase(),
    ...spec.identifyThrough.map((i) => i.text),
  ].join("_");
  return {
    path,
    type: leaf.ref.type,
    paramName,
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
    const actionDeps = collectActionDeps(endSpec.actions);

    const actions = wrapActionsWithSelect(def, rawActions, actionDeps);
    const authorize = composeExpression(endSpec.authorize, []);
    const authorizeDeps = collectDepsFromExpression(endSpec.authorize);
    const selectDeps = [...actionDeps, ...authorizeDeps];

    const targetsWithSelect = wrapTargetsWithSelect(def, targets, selectDeps);
    const parentContext = _.initial(targetsWithSelect);
    const target = _.last(targetsWithSelect)!;
    const authSelect = getAuthSelect(def, selectDeps);

    // should endpoint respond - only if something else (eg. action) does not send response before
    const respondingActions = actions.filter(
      (a) => (a.kind === "execute-hook" && a.responds) || a.kind === "respond"
    );
    const responds = respondingActions.length === 0; // check if there are actions that "respond", if no, then endpoint should respond

    const fieldset = composeFieldset(def, endSpec);

    switch (endSpec.kind) {
      case "get": {
        return {
          kind: "get",
          authSelect,
          authorize,
          response: composeSelect(endSpec.response, context.namePath),
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
          response: composeSelect(endSpec.response, context.namePath),
          // actions,
          parentContext,
          target: _.omit(target, "identifyWith"),
          orderBy: composeOrderBy(context.namePath, endSpec.orderBy),
          filter: composeFilter(context.namePath, endSpec.filter),
        };
      }
      case "create": {
        return {
          kind: "create",
          fieldset,
          actions,
          parentContext,
          target: _.omit(target, "identifyWith"),
          authSelect,
          authorize,
          response: composeSelect(endSpec.response, context.namePath),
        };
      }
      case "update": {
        return {
          kind: "update",
          fieldset,
          actions,
          parentContext,
          target: _.first(wrapTargetsWithSelect(def, [target], selectDeps))!,
          authSelect,
          authorize,
          response: composeSelect(endSpec.response, context.namePath),
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

export function composeFilter(
  fromPath: string[],
  filter: Spec.Expr<"db"> | undefined
): TypedExprDef | undefined {
  return filter && composeExpression(filter, fromPath);
}

function composeFieldset(def: Definition, endSpec: Spec.Endpoint): FieldsetRecordDef | undefined {
  const actionFieldset = composeFieldsetPairsFromActions(def, endSpec.actions);
  const extraInputFieldset = fieldsetFromExtraInputs(def, endSpec);

  // return fieldset only if it's not empty, otherwise return "undefined"
  if (actionFieldset.length > 0 || extraInputFieldset.length > 0) {
    return collectFieldsetPaths([...actionFieldset, ...extraInputFieldset]);
  }
}

type FieldsetPair = [string[], FieldsetFieldDef];

export function composeFieldsetPairsFromActions(
  def: Definition,
  actions: Spec.Action[]
): FieldsetPair[] {
  return actions.flatMap((action): FieldsetPair[] => {
    return match(action)
      .with({ kind: "create" }, { kind: "update" }, (action) => {
        const inputOrReferenceAtoms = kindFilter(action.actionAtoms, "input", "reference");
        const explicit = inputOrReferenceAtoms.map((atom) => {
          // calculate fieldset path
          const fieldsetNamespace = action.isPrimary ? [] : [action.alias];

          return match<typeof atom, FieldsetPair>(atom)
            .with({ kind: "input" }, (input): FieldsetPair => {
              const field = getRef.field(def, input.target.parentModel, input.target.name);
              return [
                [...fieldsetNamespace, input.target.name],
                {
                  kind: "field",
                  nullable: field.nullable,
                  required: !(input.optional || !!input.default),
                  type: field.type,
                  validate: field.validate && _.cloneDeep(field.validate),
                },
              ];
            })
            .with({ kind: "reference" }, (reference) => {
              const ref = reference.target;
              const leaf = _.last(reference.through)!;
              const field = getRef.field(def, leaf.parentModel, leaf.name);
              return [
                [
                  ...fieldsetNamespace,
                  [reference.target.name, ...reference.through.map((t) => t.name)].join("_"),
                ],
                {
                  kind: "field",
                  nullable: ref.nullable,
                  required: action.kind === "create", // FIXME? no way to pass this from BP
                  type: field.type,
                  validate: field.validate && _.cloneDeep(field.validate),
                },
              ];
            })
            .exhaustive();
        });
        if (action.kind === "update") {
          return explicit;
        }
        // else - find all implicit inputs
        const usedFields = action.actionAtoms.map((atom) =>
          match(atom)
            .with({ kind: "input" }, (input) => input.target.name)
            .with({ kind: "reference" }, (ref) => ref.target.name + "_id")
            .with({ kind: "set" }, (set) =>
              match(set.target)
                // FIXME a reference should be accessible here as well
                .with({ atomKind: "field" }, (field) => field.name)
                .exhaustive()
            )
            .exhaustive()
        );
        const model = getRef.model(def, getTypeModel(_.last(action.targetPath)!.type)!);
        const implicit = model.fields
          .filter((f) => !usedFields.includes(f.name) && f.name != "id")
          .map((field): FieldsetPair => {
            return [
              ["FIXME ACCESS"],
              {
                kind: "field",
                nullable: field.nullable,
                required: true,
                type: field.type,
                validate: field.validate,
              },
            ];
          });
        return [...explicit, ...implicit];
      })
      .otherwise(() => []);
  });
}

function fieldsetFromExtraInputs(
  def: Definition,
  endSpec: Spec.Endpoint
): [string[], FieldsetFieldDef][] {
  return endSpec.input.map((atom) => [
    [atom.name],
    {
      kind: "field",
      type: atom.type,
      required: !atom.optional,
      nullable: atom.nullable,
      validate: atom.validate && composeValidate(atom.validate),
    },
  ]);
}

/**
 * Converts a list of single `FieldsetFieldDef`s with their desired paths
 * into a `FieldsetDef` that nests `FieldsetRecordDef`s in order to respect
 * desired access path for each `FieldsetFieldDef`.
 */
function collectFieldsetPaths(paths: [string[], FieldsetFieldDef][]): FieldsetRecordDef {
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

type SelectDep = { alias: string; access: string[] };
/**
 * Iterates over actions in order to collect, for each of the actions and a default target
 * context variables, which fields are required in the following actions, so that they can
 * be fetched from the database beforehand.
 * Eg. if a `Repo` aliased as `myrepo` requires `myorg.id`, we need to instruct `myorg`
 * context variable to fetch the `id` so it can be referenced later by `myrepo`.
 */

export function collectActionDeps(actions: Spec.Action[]): SelectDep[] {
  // collect all `create` parents, `update` targets or `delete` sources
  const targetDeps: SelectDep[] = kindFilter(actions, "create", "update", "delete")
    .map((action) =>
      match(action)
        .with({ kind: "create" }, (action) => [
          // using initial, eg. `create owner.org.repos` resolves into `owner.org.id`
          ..._.initial(action.targetPath).map((tp) => tp.text),
          "id",
        ])
        .with({ kind: "update" }, (action) => [...action.targetPath.map((tp) => tp.text), "id"])
        .with({ kind: "delete" }, (action) => {
          const [source, ..._] = action.targetPath;
          if (source.ref.kind === "modelAtom") {
            // we need to keep track of source reference if it's a model atom
            // (reference, relation, query).
            return [source.text, "id"];
          } else {
            // If it's a model, nothing to collect.
            // Other options are not valid.
            return [];
          }
        })
        .exhaustive()
    )
    .map(([alias, ...access]) => ({ alias, access }));

  // NOTE: delete target paths are evaluated in SQL

  const setterExpressions: Spec.Expr<"code">[] = _.compact(
    actions.flatMap((action) =>
      match(action)
        .with({ kind: "create" }, { kind: "update" }, (action) =>
          action.actionAtoms.flatMap((atom) =>
            match(atom)
              .with({ kind: "input" }, (atom) => atom.default)
              .with({ kind: "reference" }, () => [])
              .with({ kind: "set" }, (set) => [set.expr])
              .exhaustive()
          )
        )
        .with({ kind: "respond" }, (respond) => [
          respond.body,
          respond.httpStatus,
          ...(respond.httpHeaders?.map((h) => h.value) ?? []),
        ])
        .with({ kind: "execute" }, (execute) => execute.hook.args.map((a) => a.expr))
        .with({ kind: "delete" }, () => [])
        .with({ kind: "query" }, (q) => {
          const selectExprs = q.query.select?.map((s) => s.expr) ?? [];
          // FIXME `orderBy` should support expressions as well
          return [...selectExprs, q.query.filter];
        })
        .with({ kind: "validate" }, (validate) =>
          collectExpressionsFromValidators(validate.validate)
        )
        .exhaustive()
    )
  );

  const setterDeps = setterExpressions.flatMap(_.unary(collectDepsFromExpression));
  return [...targetDeps, ...setterDeps];
}

function collectDepsFromExpression(expr: Spec.Expr<"code"> | undefined): SelectDep[] {
  return match(expr)
    .with(undefined, () => [])
    .with({ kind: "array" }, (arr) => arr.elements.flatMap(_.unary(collectDepsFromExpression)))
    .with({ kind: "function" }, (expr) => expr.args.flatMap(_.unary(collectDepsFromExpression)))
    .with({ kind: "hook" }, ({ hook }) =>
      hook.args.flatMap(({ expr }) => collectDepsFromExpression(expr))
    )
    .with({ kind: "identifier" }, ({ identifier }) => {
      return match(identifier[0].ref)
        .with({ kind: P.union("action", "auth", "target") }, () => {
          const [alias, ...access] = identifier.map((i) => i.text);
          return [{ alias, access }];
        })
        .otherwise(() => []);
    })
    .with({ kind: "literal" }, () => [])
    .exhaustive();
}

function collectExpressionsFromValidators(vexpr: Spec.ValidateExpr): Spec.Expr<"code">[] {
  return match(vexpr)
    .with({ kind: "and" }, { kind: "or" }, (vexpr) =>
      vexpr.exprs.flatMap(_.unary(collectExpressionsFromValidators))
    )
    .with({ kind: "call" }, (vexpr) => vexpr.args)
    .exhaustive();
}

// function collectAuthorizeDeps(def: Definition, expr: TypedExprDef): SelectDep[] {
//   // replace with `collectDepsFromExpression`??
//   if (!expr) return [];
//   switch (expr.kind) {
//     case "alias-reference": {
//       const [alias, ...access] = expr.path;
//       return [{ alias, access }];
//     }
//     case "literal": {
//       return [];
//     }
//     case "identifier-path": {
//       throw new UnreachableError("'identifier-path' is not allowed in authorize deps");
//     }
//     case "function": {
//       return expr.args.flatMap((arg) => collectAuthorizeDeps(def, arg));
//     }
//     case "in-subquery":
//     case "aggregate-function": {
//       /**
//        * Fixme we should support aggregate functions & subqueries inside of authorize expressions.
//        * SelectableExpression support is here, so even these deps can be collected.
//        * This would require a significant rewrite of `deps` logic because it doesn't support
//        * anonymous expressions, even though they are selectable.
//        */
//       throw new Error("Not implemented");
//     }
//     case "array": {
//       return expr.elements.flatMap((e) => collectAuthorizeDeps(def, e));
//     }
//     case "hook": {
//       return expr.hook.args.flatMap((arg) => collectAuthorizeDeps(def, arg.setter));
//     }
//     default: {
//       assertUnreachable(expr);
//     }
//   }
// }

/**
 * Converts `TargetDef`s into `TargetWithSelectDef`s using select deps to resolve each target's `SelectDef`.
 */
function wrapTargetsWithSelect(
  def: Definition,
  targets: TargetDef[],
  deps: SelectDep[]
): TargetWithSelectDef[] {
  return targets.map((target) => {
    const targetPaths = deps.filter((dep) => dep.alias === target.alias).map((dep) => dep.access);
    // make sure we always request an `id` for a target
    targetPaths.push(["id"]);
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
    if (a.kind !== "create-one" && a.kind !== "update-one" && a.kind !== "query") return a;
    // don't select deps for query action if it is already selected
    if (a.kind === "query" && a.query.select.length > 0) return a;

    const paths = deps.filter((d) => d.alias === a.alias).map((a) => a.access);
    // make sure we always request an `id` for a target
    paths.push(["id"]);
    const model = getRef.model(def, a.model);

    const select = pathsToSelectDef(def, model, paths, [a.alias]);
    if (a.kind === "query") {
      a.query.select = transformSelectPath(select, [a.alias], a.query.fromPath);
      return a;
    }
    return { ...a, select };
  });
}

function getAuthSelect(def: Definition, deps: SelectDep[]): SelectDef {
  if (!def.authenticator) return [];
  const paths = deps.filter((dep) => dep.alias === "@auth").map((dep) => dep.access);
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
      case "field": {
        return {
          kind: "expression",
          alias: name,
          expr: { kind: "identifier-path", namePath: [...namespace, name] },
          type: { kind: ref.type, nullable: ref.nullable },
        };
      }
      case "computed": {
        return {
          kind: "expression",
          alias: name,
          expr: { kind: "identifier-path", namePath: [...namespace, name] },
          type: { kind: ref.type.kind, nullable: ref.type.nullable },
        };
      }
      case "aggregate": {
        throw new UnreachableError("Aggregates are deprecated");
      }
      default: {
        const newModel = getTargetModel(def, ref.refKey);
        const select = pathsToSelectDef(def, newModel, relatedPaths, [...namespace, name]);
        return {
          kind: "nested-select",
          refKey: ref.refKey,
          alias: name,
          namePath: [...namespace, name],
          select,
        };
      }
    }
  });
}

/**
 * UTILS
 */

/**
 * Checks if endpoint has path fragments / if it can return 404.
 */
export function endpointHasContext(endpoint: EndpointDef): boolean {
  const epath = buildEndpointPath(endpoint);
  return kindFilter(epath.fragments, "identifier").length > 0;
}

/**
 * Checks if endpoint `authorize` block relies on `@auth`
 */
export function endpointUsesAuthentication(endpoint: EndpointDef): boolean {
  if (!endpoint.authorize) return false;

  // find @auth in context
  function isAuthInExpression(expr: TypedExprDef): boolean {
    return match(expr)
      .with({ kind: "alias-reference" }, (v) => v.path[0] === "@auth")
      .with({ kind: "function" }, (fn) => {
        return _.some(fn.args, isAuthInExpression);
      })
      .otherwise(() => false);
  }

  return isAuthInExpression(endpoint.authorize);
}

/**
 * Checks if endpoint `authorize` blocks relies on anything other than
 * checking if user is logged in
 */
export function endpointUsesAuthorization(endpoint: EndpointDef): boolean {
  // FIXME this can probably be improved by checking for nullability, eg in
  // @auth.user.id is not null (doesn't use Authorization unless `user` is nullable)
  if (!endpoint.authorize) return false;

  // check for anything other than `@auth.id is not null`
  function isAnotherExpression(expr: TypedExprDef): boolean {
    function isNull(expr: TypedExprDef): boolean {
      return expr?.kind === "literal" && expr.literal.kind === "null";
    }
    function isAuthId(expr: TypedExprDef): boolean {
      return expr?.kind === "alias-reference" && _.isEqual(expr.path, ["@auth", "id"]);
    }
    return match(expr)
      .with(undefined, () => false)
      .with({ kind: "function", name: "is not" }, (fn) => {
        if (isAuthId(fn.args[0]) && isNull(fn.args[1])) {
          return false;
        } else if (isNull(fn.args[0]) && isAuthId(fn.args[1])) {
          return false;
        } else {
          return true;
        }
      })
      .with({ kind: "function", name: P.union("and", "or") }, (fn) => {
        return isAnotherExpression(fn.args[0]) || isAnotherExpression(fn.args[1]);
      })
      .otherwise(() => true);
  }

  return isAnotherExpression(endpoint.authorize);
}

/**
 * Gets endpoint fieldset, if any.
 */

export function getEndpointFieldset(endpoint: EndpointDef): FieldsetDef | undefined {
  return match(endpoint)
    .with({ kind: P.union("get", "list", "delete") }, () => undefined)
    .otherwise((ep) => ep.fieldset);
}
