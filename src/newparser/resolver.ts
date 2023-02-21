import _ from "lodash";
import { match } from "ts-pattern";

import { CompilerError, ErrorCode } from "./compilerError";
import {
  Action,
  ActionAtomSet,
  ActionFieldHook,
  Computed,
  Definition,
  Endpoint,
  Entrypoint,
  Expr,
  Field,
  FieldValidationHook,
  Identifier,
  IdentifierPath,
  Model,
  ModelAtom,
  ModelHook,
  Populate,
  Populator,
  Query,
  RefBase,
  RefEndpointContext,
  RefModel,
  RefModelAtom,
  RefModelAtomDb,
  Reference,
  Relation,
  Select,
  Validator,
} from "./parsed";

import { kindFilter, kindFind, patternFind } from "@src/common/patternFilter";

const refError = { kind: "unresolved", error: true } as const;
function isRefResolved<r extends { kind: string }>(ref: RefBase<r>): boolean {
  return ref.kind === "unresolved" ? "error" in ref && ref.error === true : true;
}

type ScopeDb =
  | { kind: "querySimple"; model: string | undefined }
  | { kind: "queryAlias"; models: { model: string | undefined; as: string }[] };

type ScopeCode = { kind: "entrypoint"; models: { model: string | undefined; as: string }[] };

type Scope = ScopeDb | ScopeCode;

export function resolve(definition: Definition) {
  const errors: CompilerError[] = [];

  const models = kindFilter(definition, "model");

  function resolveDefinition(definition: Definition) {
    definition.forEach((d) =>
      match(d)
        .with({ kind: "model" }, resolveModel)
        .with({ kind: "entrypoint" }, (entrypoint) =>
          resolveEntrypoint(entrypoint, null, { kind: "entrypoint", models: [] })
        )
        .with({ kind: "populator" }, resolvePopulator)
        .exhaustive()
    );
  }

  function resolveModel(model: Model) {
    model.atoms.forEach((a) => resolveModelAtom(model, a));
  }

  function resolveModelAtom(model: Model, atom: ModelAtom) {
    if (isRefResolved(atom.ref)) return;
    match(atom)
      .with({ kind: "field" }, (field) => resolveField(model, field))
      .with({ kind: "reference" }, (reference) => resolveReference(model, reference))
      .with({ kind: "relation" }, (relation) => resolveRelation(model, relation))
      .with({ kind: "query" }, (query) => resolveQuery(model, query))
      .with({ kind: "computed" }, (computed) => resolveComputed(model, computed))
      .with({ kind: "hook" }, (hook) => resolveModelHook(model, hook))
      .exhaustive();
  }

  function resolveField(model: Model, field: Field) {
    kindFilter(field.atoms, "validate").map((validate) =>
      validate.validators.forEach(resolveValidator)
    );

    field.ref = {
      kind: "modelAtom",
      atomKind: "field",
      model: model.name.text,
      atom: field.name.text,
      nextModel: undefined,
    };
  }

  function resolveValidator(validator: Validator) {
    match(validator)
      .with({ kind: "hook" }, resolveFieldValidationHook)
      .otherwise(() => {
        // TODO: do nothing?
      });
  }

  function resolveReference(model: Model, reference: Reference) {
    const to = kindFind(reference.atoms, "to");
    if (to) to.ref = getRefModel(to.identifier);

    if (to?.ref.kind !== "model") {
      reference.ref = refError;
      return;
    }

    reference.ref = {
      kind: "modelAtom",
      atomKind: "reference",
      model: model.name.text,
      atom: reference.name.text,
      nextModel: to.ref.model,
    };
  }

  function resolveRelation(model: Model, relation: Relation) {
    const from = kindFind(relation.atoms, "from");
    if (from) from.ref = getRefModel(from.identifier);
    const fromModel = from?.ref.kind === "model" ? from.ref.model : undefined;

    const through = kindFind(relation.atoms, "through");
    if (through) through.ref = getRefModelAtom(fromModel, through.identifier, "reference");

    if (from?.ref.kind !== "model" || through?.ref.kind !== "modelAtom") {
      relation.ref = refError;
      return;
    }

    relation.ref = {
      kind: "modelAtom",
      atomKind: "relation",
      model: model.name.text,
      atom: relation.name.text,
      nextModel: from.ref.model,
    };
  }

  function resolveQuery(model: Model, query: Query) {
    let currentModel: string | undefined;
    let scope: ScopeDb = { kind: "querySimple", model: undefined };

    const from = kindFind(query.atoms, "from");
    if (from) {
      currentModel = model.name.text;
      from.refs = from.identifierPath.map((i) => {
        const ref = getRefModelAtom(currentModel, i, "reference", "relation", "query");
        currentModel = ref.kind === "modelAtom" ? ref.nextModel : undefined;
        return ref;
      });

      if (from.as) {
        const models = from.as.identifier.map((identifier, i) => {
          const ref = from.refs[i];
          const model = ref.kind === "unresolved" ? undefined : ref.nextModel;
          return { model, as: identifier.text };
        });
        scope = { kind: "queryAlias", models };
      } else {
        scope = { kind: "querySimple", model: currentModel };
      }
    }

    const filter = kindFind(query.atoms, "filter");
    if (filter) resolveExpression(filter.expr, scope);

    const orderBy = kindFind(query.atoms, "orderBy");
    if (orderBy) {
      orderBy.orderBy.forEach((orderBy) => {
        orderBy.refs = resolveIdentifierPath(orderBy.identifierPath, scope);
      });
    }

    const select = kindFind(query.atoms, "select");
    if (select) resolveSelect(select.select, currentModel, scope);

    if (!currentModel) {
      query.ref = refError;
      return;
    }

    query.ref = {
      kind: "modelAtom",
      atomKind: "query",
      model: model.name.text,
      atom: query.name.text,
      nextModel: currentModel,
    };
  }

  function resolveComputed(model: Model, computed: Computed) {
    resolveExpression(computed.expr, {
      kind: "querySimple",
      environment: "db",
      model: model.name.text,
    });

    computed.ref = {
      kind: "modelAtom",
      atomKind: "computed",
      model: model.name.text,
      atom: computed.name.text,
      nextModel: undefined,
    };
  }

  // passing null as a parent model means this is root model, while undefined means it is unresolved
  function resolveEntrypoint(
    entrypoint: Entrypoint,
    parentModel: string | undefined | null,
    scope: ScopeCode
  ) {
    let currentModel: string | undefined;

    const target = kindFind(entrypoint.atoms, "target");
    if (target) {
      if (parentModel === null) {
        const modelRef = getRefModel(target.identifier.identifier);
        currentModel = modelRef.kind === "model" ? modelRef.model : undefined;
      } else {
        const relationRef = getRefModelAtom(parentModel, target.identifier.identifier, "relation");
        currentModel = relationRef.kind === "modelAtom" ? relationRef.nextModel : undefined;
      }
      if (target.identifier.as) {
        scope.models.push({ model: currentModel, as: target.identifier.as.identifier.text });
      }
    }

    const identifyWith = kindFind(entrypoint.atoms, "identifyWith");
    if (identifyWith) {
      identifyWith.ref = getRefModelAtom(currentModel, identifyWith.identifier, "field");
    }

    const response = kindFind(entrypoint.atoms, "response");
    if (response) resolveSelect(response.select, currentModel, scope);

    const authorize = kindFind(entrypoint.atoms, "authorize");
    if (authorize) resolveExpression(authorize.expr, scope);

    kindFilter(entrypoint.atoms, "endpoint").forEach((endpoint) =>
      resolveEndpoint(endpoint, currentModel, _.cloneDeep(scope))
    );

    kindFilter(entrypoint.atoms, "entrypoint").forEach((entrypoint) =>
      resolveEntrypoint(entrypoint, currentModel, _.cloneDeep(scope))
    );
  }

  function resolveEndpoint(endpoint: Endpoint, model: string | undefined, scope: ScopeCode) {
    const action = kindFind(endpoint.atoms, "action");
    if (action) {
      action.actions.forEach((action) => {
        resolveAction(action, model, scope);
      });
    }

    const authorize = kindFind(endpoint.atoms, "authorize");
    if (authorize) resolveExpression(authorize.expr, scope);
  }

  function resolveAction(action: Action, parentModel: string | undefined, scope: ScopeCode) {
    let currentModel: string | undefined = parentModel;
    if (action.target) {
      action.refs = resolveIdentifierPath(action.target.identifierPath, scope);
      const targetRef = action.refs.at(-1);
      currentModel =
        targetRef?.kind === "model"
          ? targetRef.model
          : targetRef?.kind === "modelAtom"
          ? targetRef.nextModel
          : undefined;
      if (action.target.as) {
        scope.models.push({ model: currentModel, as: action.target.as.identifier.text });
      }
    }

    action.atoms.forEach((a) =>
      match(a)
        .with({ kind: "set" }, (set) => resolveActionAtomSet(set, currentModel, scope))
        .with({ kind: "referenceThrough" }, (referenceThrough) => {
          referenceThrough.targetRef = getRefModelAtom(
            currentModel,
            referenceThrough.target,
            "reference"
          );
          const refModel =
            referenceThrough.targetRef.kind === "modelAtom"
              ? referenceThrough.targetRef.nextModel
              : undefined;
          referenceThrough.throughRef = getRefModelAtom(
            refModel,
            referenceThrough.through,
            "field"
          );
        })
        .with({ kind: "deny" }, (deny) => {
          if (deny.fields.kind === "list") {
            deny.fields.fields.forEach((field) => {
              field.ref = getRefModelAtom(currentModel, field.identifier);
            });
          }
        })
        .with({ kind: "input" }, (input) => {
          input.fields.forEach((field) => {
            field.ref = getRefModelAtom(currentModel, field.field);
            kindFilter(field.atoms, "default").map(({ value }) => resolveExpression(value, scope));
          });
        })
        .exhaustive()
    );
  }

  function resolveActionAtomSet(set: ActionAtomSet, model: string | undefined, scope: ScopeCode) {
    set.ref = getRefModelAtom(model, set.target, "field", "reference");
    match(set.set)
      .with({ kind: "hook" }, (hook) => resolveActionFieldHook(hook, scope))
      .with({ kind: "expr" }, ({ expr }) => resolveExpression(expr, scope))
      .exhaustive();
  }

  function resolvePopulator(populator: Populator) {
    populator.atoms.forEach((populate) =>
      resolvePopulate(populate, null, { kind: "entrypoint", models: [] })
    );
  }

  function resolvePopulate(
    populate: Populate,
    parentModel: string | undefined | null,
    scope: ScopeCode
  ) {
    let currentModel: string | undefined;

    const from = kindFind(populate.atoms, "target");
    if (from) {
      if (parentModel === null) {
        const modelRef = getRefModel(from.identifier.identifier);
        currentModel = modelRef.kind === "model" ? modelRef.model : undefined;
      } else {
        const relationRef = getRefModelAtom(parentModel, from.identifier.identifier, "relation");
        currentModel = relationRef.kind === "modelAtom" ? relationRef.nextModel : undefined;
      }
      if (from.identifier.as) {
        scope.models.push({ model: currentModel, as: from.identifier.as.identifier.text });
      }
    }

    const identifyWith = kindFind(populate.atoms, "identify");
    if (identifyWith) {
      identifyWith.ref = getRefModelAtom(currentModel, identifyWith.identifier, "field");
    }

    kindFilter(populate.atoms, "set").forEach((set) =>
      resolveActionAtomSet(set, currentModel, scope)
    );

    kindFilter(populate.atoms, "populate").forEach((populate) =>
      resolvePopulate(populate, currentModel, _.cloneDeep(scope))
    );
  }

  function resolveModelHook(model: Model, hook: ModelHook) {
    hook.ref = {
      kind: "modelAtom",
      atomKind: "hook",
      model: model.name.text,
      atom: hook.name.text,
      nextModel: undefined,
    };
  }

  function resolveFieldValidationHook(_hook: FieldValidationHook) {
    // TODO: do nothing?
  }

  function resolveActionFieldHook(hook: ActionFieldHook, scope: ScopeCode) {
    kindFilter(hook.atoms, "arg_expr").map(({ expr }) => resolveExpression(expr, scope));
  }

  function resolveSelect(select: Select, model: string | undefined, scope: Scope) {
    select.forEach((s) => {
      if (s.identifierPath) {
        s.refs = resolveIdentifierPath(s.identifierPath, scope);
      } else {
        s.refs = resolveIdentifierPathForModel(model, [s.name], "model");
      }
      const nested = s.select;
      if (nested) {
        const lastRef = s.refs.at(-1);
        const nestedModel = lastRef?.kind === "modelAtom" ? lastRef.nextModel : undefined;
        if (!nestedModel) {
          const errorToken = s.identifierPath ? s.identifierPath.at(-1)!.token : s.name.token;
          errors.push(new CompilerError(errorToken, ErrorCode.SelectCantNest));
          return;
        }
        const nestedScope: Scope =
          scope.kind === "querySimple"
            ? { kind: "querySimple", model: nestedModel }
            : {
                kind: "queryAlias",
                models: [...scope.models, { model: nestedModel, as: s.name.text }],
              };
        resolveSelect(nested, nestedModel, nestedScope);
      }
    });
  }

  function resolveExpression<s extends Scope, k extends s extends ScopeDb ? "db" : "code">(
    expr: Expr<k>,
    scope: s
  ) {
    match(expr)
      .with({ kind: "binary" }, ({ lhs, rhs }) => {
        resolveExpression(lhs, scope);
        resolveExpression(rhs, scope);
      })
      .with({ kind: "group" }, ({ expr }) => resolveExpression(expr, scope))
      .with({ kind: "unary" }, ({ expr }) => resolveExpression(expr, scope))
      .with({ kind: "identifierPath" }, (identifierPath) => {
        identifierPath.refs = resolveIdentifierPath(identifierPath.identifierPath, scope);
      })
      .with({ kind: "literal" }, (_literal) => {
        // TODO: do nothing?
      })
      .with({ kind: "function" }, (function_) => {
        function_.args.forEach((arg) => resolveExpression(arg, scope));
      })
      .exhaustive();
  }

  function resolveIdentifierPath<
    s extends Scope,
    r extends s extends ScopeDb ? RefModelAtomDb : RefEndpointContext
  >(path: IdentifierPath, scope: Scope): r[] {
    switch (scope.kind) {
      case "entrypoint": {
        const [modelIdentifier, ...identifiers] = path;

        let model: string | undefined;
        if (modelIdentifier.text === "@auth") {
          model = "@auth";
        } else {
          model = scope.models.find((model) => model.as === modelIdentifier.text)?.model;
        }
        if (!model) {
          errors.push(new CompilerError(modelIdentifier.token, ErrorCode.CantResolveModel));
        }

        const modelRef = model ? { kind: "model", model } : refError;
        return [
          modelRef as r,
          ...(resolveIdentifierPathForModel(model, identifiers, "entrypoint") as r[]),
        ];
      }
      case "queryAlias": {
        const [modelIdentifier, ...identifiers] = path;
        const model = scope.models.find((model) => model.as === modelIdentifier.text)?.model;
        if (!model) {
          errors.push(new CompilerError(modelIdentifier.token, ErrorCode.CantResolveModel));
        }
        return resolveIdentifierPathForModel(model, identifiers, "db") as r[];
      }
      case "querySimple": {
        return resolveIdentifierPathForModel(scope.model, path, "db") as r[];
      }
    }
  }

  function resolveIdentifierPathForModel<
    e extends "db" | "model" | "entrypoint",
    r extends e extends "db"
      ? RefModelAtomDb
      : e extends "model"
      ? RefModelAtom
      : RefEndpointContext
  >(model: string | undefined, path: IdentifierPath, environment: e): r[] {
    let currentModel = model;
    return path.map((i) => {
      const kinds: ModelAtom["kind"][] =
        environment === "db"
          ? ["field", "reference", "relation", "query", "computed"]
          : ["field", "reference", "relation", "query", "computed", "hook"];
      const ref = getRefModelAtom(currentModel, i, ...kinds) as r;
      currentModel = ref.kind === "modelAtom" ? ref.nextModel : undefined;
      return ref;
    });
  }

  function getRefModel(identifier: Identifier): RefModel {
    const model = findModel(identifier.text);
    if (!model) {
      errors.push(new CompilerError(identifier.token, ErrorCode.CantResolveModel));
    }
    return model ? { kind: "model", model: model.name.text } : refError;
  }

  function getRefModelAtom<k extends ModelAtom["kind"]>(
    modelName: string | undefined,
    identifier: Identifier,
    ...kinds: k[]
  ): RefModelAtom<k> {
    if (!modelName) return refError;
    const model = findModel(modelName);
    if (!model) return refError;
    const atom = patternFind(model.atoms, { name: { text: identifier.text } });

    for (const kind of kinds) {
      if (kind === atom?.kind) {
        resolveModelAtom(model, atom);
        return atom.ref as RefModelAtom<k>;
      }
    }

    errors.push(new CompilerError(identifier.token, ErrorCode.CantResolveModelAtom));
    return refError;
  }

  function findModel(name: string): Model | undefined {
    return patternFind(models, { name: { text: name } });
  }

  resolveDefinition(definition);

  return errors;
}
