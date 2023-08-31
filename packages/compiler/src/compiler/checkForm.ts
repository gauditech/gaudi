import _ from "lodash";
import { match } from "ts-pattern";

import {
  Action,
  AnonymousQuery,
  Api,
  Authenticator,
  Computed,
  DeleteAction,
  Endpoint,
  EndpointType,
  Entrypoint,
  ExecuteAction,
  ExtraInput,
  Field,
  Generator,
  GlobalAtom,
  Hook,
  Identifier,
  Model,
  ModelAction,
  Populate,
  Populator,
  Query,
  QueryAction,
  Reference,
  Relation,
  RespondAction,
  Select,
  TokenData,
  Validator,
} from "./ast/ast";
import { CompilerError, ErrorCode } from "./compilerError";

import { kindFilter, kindFind } from "@compiler/common/kindFilter";

export function checkForm(document: GlobalAtom[]) {
  const errors: CompilerError[] = [];

  function checkDocument(document: GlobalAtom[]) {
    kindFilter(document, "runtime").forEach((runtime) => {
      containsAtoms(runtime, ["sourcePath"]);
      noDuplicateAtoms(runtime, ["default", "sourcePath"]);
    });

    document.forEach((a) =>
      match(a)
        .with({ kind: "validator" }, checkValidator)
        .with({ kind: "model" }, checkModel)
        .with({ kind: "api" }, checkApi)
        .with({ kind: "populator" }, checkPopulator)
        .with({ kind: "runtime" }, () => undefined) // runtime is checked first
        .with({ kind: "authenticator" }, () => checkAuthenticator)
        .with({ kind: "generator" }, () => checkGenerator)
        .exhaustive()
    );

    const generators = kindFilter(document, "generator");
    checkNoDuplicateGenerators(generators);
  }

  function checkValidator(validator: Validator) {
    const args = kindFilter(validator.atoms, "arg");
    noDuplicateNames(
      args.map(({ name }) => name),
      ErrorCode.DuplicateModelAtom
    );
    containsAtoms(validator, ["arg", "error", "assert"]);
    noDuplicateAtoms(validator, ["error", "assert"]);
  }

  function checkModel(model: Model) {
    noDuplicateNames(
      model.atoms.map(({ name }) => name),
      ErrorCode.DuplicateModelAtom
    );
    model.atoms.forEach((a) =>
      match(a)
        .with({ kind: "field" }, checkField)
        .with({ kind: "reference" }, checkReference)
        .with({ kind: "relation" }, checkRelation)
        .with({ kind: "query" }, checkQuery)
        .with({ kind: "computed" }, checkComputed)
        .with({ kind: "hook" }, checkHook)
        .exhaustive()
    );
  }

  function checkField(field: Field) {
    containsAtoms(field, ["type"]);
    noDuplicateAtoms(field, ["type", "default", "nullable", "unique", "validate"]);
  }

  function checkReference(reference: Reference) {
    containsAtoms(reference, ["to"]);
    noDuplicateAtoms(reference, ["to", "nullable", "unique", "onDelete"]);

    const nullable = kindFilter(reference.atoms, "nullable")[0];
    const onDelete = kindFilter(reference.atoms, "onDelete")[0];
    // allow "set null" action only on nullable references
    if (onDelete?.action.kind === "setNull" && nullable == null) {
      errors.push(
        new CompilerError(onDelete.action.keyword, ErrorCode.ReferenceOnDeleteNotNullable)
      );
    }
  }

  function checkRelation(relation: Relation) {
    containsAtoms(relation, ["from", "through"]);
    noDuplicateAtoms(relation, ["from", "through"]);
  }

  function checkQuery(query: Query | QueryAction | AnonymousQuery) {
    if (query.kind !== "anonymousQuery") {
      containsAtoms(query, ["from"]);
    }
    noDuplicateAtoms(query, [
      "from",
      "filter",
      "orderBy",
      "limit",
      "offset",
      "select",
      "aggregate",
    ]);

    const from = kindFind(query.atoms, "from");
    if (from && from.as) {
      if (from.as.identifierPath.length !== from.identifierPath.length) {
        errors.push(
          new CompilerError(from.as.identifierPath[0].token, ErrorCode.QueryFromAliasWrongLength)
        );
      }
    }

    const aggregate = kindFind(query.atoms, "aggregate");
    const limitOrOffsets = kindFilter(query.atoms, "limit", "offset");
    if (aggregate?.aggregate === "first" || aggregate?.aggregate === "one") {
      for (const limitOrOffset of limitOrOffsets) {
        errors.push(
          new CompilerError(limitOrOffset.keyword, ErrorCode.LimitOrOffsetWithCardinalityModifier, {
            limitOrOffset: limitOrOffset.kind,
            cardinalityModifier: aggregate.aggregate,
          })
        );
      }
    }

    const orderBy = kindFind(query.atoms, "orderBy");
    if (orderBy && aggregate?.aggregate === "one") {
      errors.push(new CompilerError(orderBy.keyword, ErrorCode.OrderByWithOne));
    }

    const select = kindFind(query.atoms, "select");
    if (select) checkSelect(select.select);
  }

  function checkComputed(_computed: Computed) {
    // TODO: do nothing?
  }

  function checkApi(api: Api) {
    api.atoms.forEach((a) => match(a).with({ kind: "entrypoint" }, checkEntrypoint).exhaustive());
  }

  function checkEntrypoint(entrypoint: Entrypoint) {
    noDuplicateAtoms(entrypoint, ["identify", "authorize", "response"]);

    const endpoints = kindFilter(entrypoint.atoms, "endpoint");
    const definedEndpoints = new Set<EndpointType>();
    endpoints.forEach(({ type, keywordType }) => {
      if (type === "custom") return;
      if (definedEndpoints.has(type)) {
        errors.push(new CompilerError(keywordType, ErrorCode.DuplicateEndpoint, { type }));
      } else {
        definedEndpoints.add(type);
      }
    });

    // check custom endpoint unique path
    const entrypointPaths = new Set(
      _.compact(kindFilter(entrypoint.atoms, "entrypoint").map((e) => e.target.text))
    );
    const customPaths = new Set<string>();
    endpoints.forEach((e) => {
      if (e.type !== "custom") return;
      const cardinality = kindFind(e.atoms, "cardinality")?.cardinality;
      const method = kindFind(e.atoms, "method")?.method;
      const path = kindFind(e.atoms, "path")?.path.value;
      if (!cardinality || !method || !path) return;
      const key = cardinality + "#" + method + "#" + path;
      if (customPaths.has(key)) {
        errors.push(new CompilerError(e.keywordType, ErrorCode.DuplicateCustomEndpointPath));
      } else if (cardinality === "one" && entrypointPaths.has(path)) {
        errors.push(
          new CompilerError(e.keywordType, ErrorCode.CustomEndpointPathClashesWithEnrtrypoint, {
            path,
          })
        );
      } else {
        customPaths.add(key);
      }
    });

    entrypoint.atoms.forEach((a) =>
      match(a)
        .with({ kind: "response" }, ({ select }) => checkSelect(select))
        .with({ kind: "identify" }, (identify) => noDuplicateAtoms(identify, ["through"]))
        .with({ kind: "endpoint" }, checkEndpoint)
        .with({ kind: "entrypoint" }, checkEntrypoint)
        .otherwise(() => {
          // TODO: do nothing?
        })
    );
  }

  function checkEndpoint(endpoint: Endpoint) {
    noDuplicateAtoms(endpoint, [
      "extraInputs",
      "action",
      "authorize",
      "method",
      "cardinality",
      "path",
      "pageable",
    ]);

    if (endpoint.type === "custom") {
      containsAtoms(
        endpoint,
        ["method", "cardinality", "path"],
        (parent, kind) =>
          new CompilerError(parent.keyword, ErrorCode.EndpointMustContainAtom, {
            type: endpoint.type,
            atom: kind,
          })
      );
    } else {
      cannotContainAtoms(
        endpoint,
        ["method", "cardinality", "path"],
        (parent, kind) =>
          new CompilerError(parent.keyword, ErrorCode.EndpointCannotContainAtom, {
            type: endpoint.type,
            atom: kind,
          })
      );
    }

    const extraInputs = kindFind(endpoint.atoms, "extraInputs");
    if (extraInputs) {
      const allIdentifiers = extraInputs.extraInputs.map((extraInput) => {
        checkExtraInput(extraInput);
        return extraInput.name;
      });
      noDuplicateNames(allIdentifiers, ErrorCode.DuplicateActionAtom);
    }

    const action = kindFind(endpoint.atoms, "action");
    if (action) {
      action.actions.map((a) => checkAction(a, endpoint.type));

      // only single "execute" action with "responds"
      const executeWithResponds = _.compact(
        kindFilter(action.actions, "execute").map((a) => kindFind(a.atoms, "responds"))
      );
      if (executeWithResponds.length > 1) {
        errors.push(
          new CompilerError(executeWithResponds[1].keyword, ErrorCode.MoreThanOneRespondsInEndpoint)
        );
      }

      // only single "respond" action
      const respondActions = _.compact(kindFilter(action.actions, "respond"));
      if (respondActions.length > 1) {
        errors.push(
          new CompilerError(
            respondActions[1].keyword,
            ErrorCode.MoreThanOneRespondsActionInEndpoint
          )
        );
      }

      // only one "execute" action with "responds" or "respond" action
      if (executeWithResponds.length > 0 && respondActions.length > 0) {
        errors.push(
          // pick keyword from one of them, we choose `executeWithResponds` since it will probably be replaced by "respondActions"
          new CompilerError(executeWithResponds[0].keyword, ErrorCode.MoreThanOneActionThatRespond)
        );
      }

      // actions after "respond" actions are not allowed
      const respondActionIdx = action.actions.findIndex((a) => a.kind === "respond");
      if (respondActionIdx != -1 && respondActionIdx + 1 < action.actions.length) {
        errors.push(
          // target the next action after "respond"
          new CompilerError(
            action.actions[respondActionIdx + 1].keyword,
            ErrorCode.RespondActionNotLast
          )
        );
      }
    }

    if (endpoint.type !== "list") {
      cannotContainAtoms(
        endpoint,
        ["pageable", "orderBy", "filter"],
        (parent, kind) =>
          new CompilerError(parent.keyword, ErrorCode.EndpointCannotContainAtom, {
            type: endpoint.type,
            atom: kind,
          })
      );
    }
  }

  function checkExtraInput(field: ExtraInput) {
    containsAtoms(field, ["type"]);
    noDuplicateAtoms(field, ["type", "nullable", "validate"]);
  }

  function checkAction(action: Action, endpointType: EndpointType) {
    match(action)
      .with({ kind: "create" }, { kind: "update" }, (a) => checkModelAction(a, endpointType))
      .with({ kind: "delete" }, (a) => checkDeleteAction(a, endpointType))
      .with({ kind: "execute" }, (a) => checkExecuteAction(a, endpointType))
      .with({ kind: "respond" }, (a) => checkRespondAction(a, endpointType))
      .with({ kind: "queryAction" }, checkQueryAction)
      .with({ kind: "validate" }, () => undefined) // no check needed
      .exhaustive();
  }

  function checkModelAction(action: ModelAction, endpointType: EndpointType) {
    if (!action.target && action.kind !== endpointType) {
      errors.push(
        new CompilerError(action.keyword, ErrorCode.InvalidDefaultAction, {
          action: action.kind,
          endpoint: endpointType,
        })
      );
    }
    if (action.target && !action.as) {
      errors.push(
        new CompilerError(action.target[0].token, ErrorCode.NonDefaultModelActionRequiresAlias)
      );
    }

    const allIdentifiers = action.atoms.flatMap((a): Identifier[] =>
      match(a)
        .with({ kind: "set" }, ({ target }) => [target])
        .with({ kind: "referenceThrough" }, ({ target }) => [target])
        .with({ kind: "input" }, ({ fields }) =>
          fields.map((field) => {
            noDuplicateAtoms({ ...field, kind: "input" }, ["required", "default"]);
            return field.field;
          })
        )
        .with({ kind: "input-all" }, (a) => a.except)
        .exhaustive()
    );
    noDuplicateNames(allIdentifiers, ErrorCode.DuplicateActionAtom);
    noDuplicateAtoms(action, ["input-all"]);
  }

  function checkDeleteAction(action: DeleteAction, endpointType: EndpointType) {
    if (!action.target && action.kind !== endpointType) {
      errors.push(
        new CompilerError(action.keyword, ErrorCode.InvalidDefaultAction, {
          action: "delete",
          endpoint: endpointType,
        })
      );
    }
  }

  function checkExecuteAction(action: ExecuteAction, endpointType: EndpointType) {
    containsAtoms(action, ["hook"]);
    noDuplicateAtoms(action, ["hook", "responds"]);

    const hook = kindFind(action.atoms, "hook");
    if (hook) checkHook(hook);
    const responds = kindFind(action.atoms, "responds");
    if (responds && endpointType !== "custom") {
      errors.push(
        new CompilerError(responds.keyword, ErrorCode.RespondsCanOnlyBeUsedInCustomEndpoint)
      );
    }
  }
  function checkRespondAction(action: RespondAction, endpointType: EndpointType) {
    containsAtoms(action, ["body"]);
    noDuplicateAtoms(action, ["body", "httpStatus", "httpHeaders"]);

    if (endpointType !== "custom") {
      errors.push(new CompilerError(action.keyword, ErrorCode.RespondActionNotInCustomEndpoint));
    }
  }

  function checkQueryAction(action: QueryAction) {
    noDuplicateAtoms(action, ["update", "delete"]);

    const updateOrDelete = kindFilter(action.atoms, "update", "delete");
    if (updateOrDelete.length > 1) {
      updateOrDelete.forEach(({ keyword }) =>
        errors.push(new CompilerError(keyword, ErrorCode.QueryActionOnlyOneUpdateOrDelete))
      );
    }

    const deleteOrSelect = kindFilter(action.atoms, "delete", "select");
    if (deleteOrSelect.length > 1) {
      deleteOrSelect.forEach(({ keyword }) =>
        errors.push(new CompilerError(keyword, ErrorCode.QueryActionOnlyOneDeleteOrSelect))
      );
    }

    checkQuery(action);
  }

  function checkPopulator(populator: Populator) {
    populator.atoms.map(checkPopulate);
  }

  function checkPopulate(populate: Populate) {
    noDuplicateAtoms(populate, ["repeat"]);
    const setIdentifiers = kindFilter(populate.atoms, "set").map(({ target }) => target);
    noDuplicateNames(setIdentifiers, ErrorCode.DuplicatePopulateSet);
    kindFilter(populate.atoms, "populate").forEach(checkPopulate);
  }

  function checkAuthenticator(authenticator: Authenticator) {
    containsAtoms(authenticator, ["method"]);
    noDuplicateAtoms(authenticator, ["method"]);
  }

  function checkGenerator(generator: Generator) {
    match(generator)
      .with({ type: "client" }, checkClientGenerator)
      .with({ type: "apidocs" }, checkApidocsGenerator)
      .exhaustive();
  }
  function checkClientGenerator(generator: Generator) {
    containsAtoms(generator, ["target"]);
    noDuplicateAtoms(generator, ["target"]);
  }
  function checkApidocsGenerator(generator: Generator) {
    noDuplicateAtoms(generator, ["basePath"]);
  }

  function checkNoDuplicateGenerators(generators: Generator[]) {
    const generatorTag: string[] = [];

    generators.forEach((generator) => {
      match(generator)
        .with({ type: "client" }, (g) => {
          const type = g.type;
          const target = kindFind(g.atoms, "target")?.value;

          const tag = `${type}-${target}`;
          if (generatorTag.includes(tag)) {
            errors.push(
              new CompilerError(g.keyword, ErrorCode.DuplicateClientGenerator, {
                type,
                target,
              })
            );
          }

          generatorTag.push(tag);
        })
        .with({ type: "apidocs" }, (g) => {
          const type = g.type;

          if (generatorTag.includes(type)) {
            errors.push(
              new CompilerError(g.keyword, ErrorCode.DuplicateApidocsGenerator, {
                type,
              })
            );
          }

          generatorTag.push(type);
        })
        .exhaustive();
    });
  }

  function checkHook(hook: Hook<"action" | "model">) {
    noDuplicateAtoms(hook, ["runtime"]);
    const sourceOrInline = kindFilter(hook.atoms, "source", "inline");
    if (sourceOrInline.length === 0) {
      errors.push(new CompilerError(hook.keyword, ErrorCode.HookMustContainSourceOrInline));
    } else if (sourceOrInline.length > 1) {
      sourceOrInline.forEach(({ keyword }) =>
        errors.push(new CompilerError(keyword, ErrorCode.HookOnlyOneSourceOrInline))
      );
    }

    const argIdentifiers = kindFilter(hook.atoms, "arg_expr", "arg_query").map(({ name }) => name);
    noDuplicateNames(argIdentifiers, ErrorCode.DuplicateHookArg);

    kindFilter(hook.atoms, "arg_query").forEach(({ query }) => checkQuery(query));
  }

  function checkSelect(select: Select) {
    const identifiers = select.map(({ target, select }): Identifier => {
      if (select) checkSelect(select);
      return target.name;
    });
    noDuplicateNames(identifiers, ErrorCode.DuplicateSelectField);
  }

  function noDuplicateNames(identifiers: Identifier[], errorCode: ErrorCode) {
    const takenNames: Set<string> = new Set();
    identifiers.forEach(({ text, token }) => {
      if (takenNames.has(text)) {
        errors.push(new CompilerError(token, errorCode));
      } else {
        takenNames.add(text);
      }
    });
  }
  function containsAtoms<
    ast extends { kind: string; keyword: TokenData; atoms: { kind: string }[] },
    k extends ast["atoms"][number]["kind"]
  >(parent: ast, kinds: k[], errorFn?: (parent: ast, kind: k) => CompilerError) {
    kinds.forEach((kind) => {
      const filteredAtoms = parent.atoms.filter((a) => a.kind === kind);
      if (filteredAtoms.length === 0) {
        errors.push(
          errorFn?.(parent, kind) ??
            new CompilerError(parent.keyword, ErrorCode.MustContainAtom, {
              parent: parent.kind,
              atom: kind,
            })
        );
      }
    });
  }

  function cannotContainAtoms<
    ast extends { kind: string; keyword: TokenData; atoms: { kind: string }[] },
    k extends ast["atoms"][number]["kind"]
  >(parent: ast, kinds: k[], errorFn?: (parent: ast, kind: k) => CompilerError) {
    kinds.forEach((kind) => {
      const filteredAtoms = parent.atoms.filter((a) => a.kind === kind);
      if (filteredAtoms.length !== 0) {
        errors.push(
          errorFn?.(parent, kind) ??
            new CompilerError(parent.keyword, ErrorCode.CannotContainAtom, {
              parent: parent.kind,
              atom: kind,
            })
        );
      }
    });
  }

  function noDuplicateAtoms<
    ast extends { kind: string; atoms: { kind: string; keyword: TokenData }[] },
    k extends ast["atoms"][number]["kind"]
  >(parent: ast, kinds: k[], errorFn?: (parent: ast, kind: k) => CompilerError) {
    kinds.forEach((kind) => {
      const filteredAtoms = parent.atoms.filter((a) => a.kind === kind);
      if (filteredAtoms.length > 1) {
        const [_first, ...other] = filteredAtoms;
        other.forEach((a) => {
          errors.push(
            errorFn?.(parent, kind) ??
              new CompilerError(a.keyword, ErrorCode.DuplicateAtom, {
                parent: parent.kind,
                atom: kind,
              })
          );
        });
      }
    });
  }

  checkDocument(document);

  return errors;
}
