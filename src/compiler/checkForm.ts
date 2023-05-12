import _ from "lodash";
import { match } from "ts-pattern";

import {
  Action,
  ActionAtomVirtualInput,
  AnonymousQuery,
  Authenticator,
  Computed,
  DeleteAction,
  Endpoint,
  EndpointType,
  Entrypoint,
  ExecuteAction,
  FetchAction,
  Field,
  Generator,
  GlobalAtom,
  Hook,
  Identifier,
  Model,
  ModelAction,
  Populate,
  Populator,
  ProjectASTs,
  Query,
  QueryView,
  Reference,
  Relation,
  Runtime,
  Select,
  TokenData,
  Validator,
} from "./ast/ast";
import { CompilerError, ErrorCode } from "./compilerError";

import { kindFilter, kindFind } from "@src/common/kindFilter";
import { getInternalExecutionRuntimeName } from "@src/composer/executionRuntimes";

export function checkForm(projectASTs: ProjectASTs) {
  const document = projectASTs.document;
  const errors: CompilerError[] = [];
  let hasDefaultRuntime = false;

  function getSumDocument(): GlobalAtom[] {
    return Object.values(projectASTs.plugins)
      .flatMap((p) => p)
      .concat(projectASTs.document);
  }

  function getAllModels(): Model[] {
    return kindFilter(getSumDocument(), "model");
  }

  function getAllRuntimes(): Runtime[] {
    return kindFilter(getSumDocument(), "runtime");
  }

  function checkDocument(document: GlobalAtom[]) {
    noDuplicateNames(
      getAllModels().map(({ name }) => name),
      ErrorCode.DuplicateModel
    );
    noDuplicateNames(
      getAllRuntimes().map(({ name }) => name),
      ErrorCode.DuplicateRuntime
    );

    const runtimes = kindFilter(document, "runtime");
    runtimes.forEach((runtime) => {
      containsAtoms(runtime, ["sourcePath"]);
      noDuplicateAtoms(runtime, ["default", "sourcePath"]);
    });

    if (runtimes.length === 1) {
      hasDefaultRuntime = true;
    } else if (runtimes.length > 1) {
      runtimes.forEach((runtime) => {
        const default_ = kindFind(runtime.atoms, "default");
        if (default_) {
          if (hasDefaultRuntime) {
            errors.push(new CompilerError(default_.keyword, ErrorCode.DuplicateDefaultRuntime));
          } else {
            hasDefaultRuntime = true;
          }
        }
      });

      if (!hasDefaultRuntime) {
        errors.push(new CompilerError(runtimes[0].keyword, ErrorCode.MustHaveDefaultRuntime));
      }
    }

    const authenticators = kindFilter(document, "authenticator");
    if (authenticators.length > 1) {
      errors.push(new CompilerError(authenticators[1].keyword, ErrorCode.DuplicateAuthBlock));
    }

    document.forEach((a) =>
      match(a)
        .with({ kind: "model" }, checkModel)
        .with({ kind: "queryView" }, () => checkQuery)
        .with({ kind: "entrypoint" }, checkEntrypoint)
        .with({ kind: "populator" }, checkPopulator)
        .with({ kind: "runtime" }, () => undefined) // runtime is checked first
        .with({ kind: "authenticator" }, () => checkAuthenticator)
        .with({ kind: "generator" }, () => checkGenerator)
        .exhaustive()
    );

    const generators = kindFilter(document, "generator");
    checkNoDuplicateGenerators(generators);
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

    kindFilter(field.atoms, "validate").map(({ validators }) => validators.forEach(checkValidator));
  }

  function checkValidator(validator: Validator) {
    match(validator)
      .with({ kind: "hook" }, checkHook)
      .otherwise(() => {
        // TODO: do nothing?
      });
  }

  function checkReference(reference: Reference) {
    containsAtoms(reference, ["to"]);
    noDuplicateAtoms(reference, ["to", "nullable", "unique"]);
  }

  function checkRelation(relation: Relation) {
    containsAtoms(relation, ["from", "through"]);
    noDuplicateAtoms(relation, ["from", "through"]);
  }

  function checkQuery(query: Query | AnonymousQuery | QueryView) {
    if (query.kind === "query" || query.kind === "queryView") {
      containsAtoms(query, ["from"]);
    }
    if (query.kind === "queryView") {
      throw new Error("Queryview found!");
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
          new CompilerError(
            from.as.identifierPath[0].identifier.token,
            ErrorCode.QueryFromAliasWrongLength
          )
        );
      }
    }

    const select = kindFind(query.atoms, "select");
    if (select) checkSelect(select.select);
  }

  function checkComputed(_computed: Computed) {
    // TODO: do nothing?
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
      _.compact(kindFilter(entrypoint.atoms, "entrypoint").map((e) => e.target.identifier.text))
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

    const action = kindFind(endpoint.atoms, "action");
    if (action) {
      action.actions.map((a) => checkAction(a, endpoint.type));

      const responds = _.compact(
        kindFilter(action.actions, "execute").map((a) => kindFind(a.atoms, "responds"))
      );
      if (responds.length > 1) {
        errors.push(
          new CompilerError(responds[1].keyword, ErrorCode.MoreThanOneRespondsInEndpoint)
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

  function checkAction(action: Action, endpointType: EndpointType) {
    match(action)
      .with({ kind: "create" }, { kind: "update" }, (a) => checkModelAction(a, endpointType))
      .with({ kind: "delete" }, (a) => checkDeleteAction(a, endpointType))
      .with({ kind: "execute" }, (a) => checkExecuteAction(a, endpointType))
      .with({ kind: "fetch" }, checkFetchAction)
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
        new CompilerError(
          action.target[0].identifier.token,
          ErrorCode.NonDefaultModelActionRequiresAlias
        )
      );
    }

    const allIdentifiers = action.atoms.flatMap((a) =>
      match(a)
        .with({ kind: "set" }, ({ target, set }) => {
          if (set.kind === "hook") checkHook(set);
          return [target.identifier];
        })
        .with({ kind: "referenceThrough" }, ({ target }) => [target.identifier])
        .with({ kind: "virtualInput" }, (virtualInput) => {
          checkActionAtomVirtualInput(virtualInput);
          return [virtualInput.name];
        })
        .with({ kind: "deny" }, ({ fields }) =>
          fields.kind === "all" ? [] : fields.fields.map(({ identifier }) => identifier)
        )
        .with({ kind: "input" }, ({ fields }) =>
          fields.map((field) => {
            noDuplicateAtoms({ ...field, kind: "input" }, ["optional", "default"]);
            return field.field.identifier;
          })
        )
        .exhaustive()
    );
    noDuplicateNames(allIdentifiers, ErrorCode.DuplicateActionAtom);
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
    const allIdentifiers = kindFilter(action.atoms, "virtualInput").map((virtualInput) => {
      checkActionAtomVirtualInput(virtualInput);
      return virtualInput.name;
    });
    noDuplicateNames(allIdentifiers, ErrorCode.DuplicateActionAtom);

    const hook = kindFind(action.atoms, "hook");
    if (hook) checkHook(hook);
    const responds = kindFind(action.atoms, "responds");
    if (responds && endpointType !== "custom") {
      errors.push(
        new CompilerError(responds.keyword, ErrorCode.RespondsCanOnlyBeUsedInCustomEndpoint)
      );
    }
  }

  function checkFetchAction(action: FetchAction) {
    containsAtoms(action, ["anonymousQuery"]);
    const allIdentifiers = kindFilter(action.atoms, "virtualInput").map((virtualInput) => {
      checkActionAtomVirtualInput(virtualInput);
      return virtualInput.name;
    });
    noDuplicateNames(allIdentifiers, ErrorCode.DuplicateActionAtom);

    const query = kindFind(action.atoms, "anonymousQuery");
    if (query) checkQuery(query);
  }

  function checkActionAtomVirtualInput(virtualInput: ActionAtomVirtualInput) {
    containsAtoms(virtualInput, ["type"]);
    noDuplicateAtoms(virtualInput, ["type", "nullable", "validate"]);
    kindFilter(virtualInput.atoms, "validate").map(({ validators }) =>
      validators.forEach(checkValidator)
    );
  }

  function checkPopulator(populator: Populator) {
    populator.atoms.map(checkPopulate);
  }

  function checkPopulate(populate: Populate) {
    noDuplicateAtoms(populate, ["repeat"]);
    const setIdentifiers = kindFilter(populate.atoms, "set").map(({ target, set }) => {
      if (set.kind === "hook") checkHook(set);
      return target.identifier;
    });
    noDuplicateNames(setIdentifiers, ErrorCode.DuplicatePopulateSet);
    kindFilter(populate.atoms, "populate").forEach(checkPopulate);
  }

  function checkAuthenticator(authenticator: Authenticator) {
    containsAtoms(authenticator, ["method"]);
    noDuplicateAtoms(authenticator, ["method"]);
  }

  function checkGenerator(generator: Generator) {
    match(generator).with({ type: "client" }, checkClientGenerator).exhaustive();
  }
  function checkClientGenerator(generator: Generator) {
    containsAtoms(generator, ["target", "api"]);
    noDuplicateAtoms(generator, ["target", "api"]);
  }

  function checkNoDuplicateGenerators(generators: Generator[]) {
    const generatorTag: string[] = [];

    generators.forEach((generator) => {
      match(generator)
        .with({ type: "client" }, (g) => {
          const type = g.type;
          const target = kindFind(g.atoms, "target")?.value;
          const api = kindFind(g.atoms, "api")?.value;

          const tag = `${type}-${target}-${api}`;
          if (generatorTag.includes(tag)) {
            errors.push(
              new CompilerError(g.keyword, ErrorCode.DuplicateGenerator, {
                type,
                target,
                api,
              })
            );
          }

          generatorTag.push(tag);
        })
        .exhaustive();
    });
  }

  function checkHook(hook: Hook<boolean, boolean>) {
    noDuplicateAtoms(hook, ["default_arg", "runtime"]);
    const sourceOrInline = kindFilter(hook.atoms, "source", "inline");
    const internalExecRuntimeName = getInternalExecutionRuntimeName();
    if (sourceOrInline.length === 0) {
      errors.push(new CompilerError(hook.keyword, ErrorCode.HookMustContainSourceOrInline));
    } else if (sourceOrInline.length > 1) {
      sourceOrInline.forEach(({ keyword }) =>
        errors.push(new CompilerError(keyword, ErrorCode.HookOnlyOneSourceOrInline))
      );
    } else if (
      sourceOrInline[0].kind === "source" &&
      !hasDefaultRuntime &&
      kindFind(hook.atoms, "runtime")?.identifier.text !== internalExecRuntimeName
    ) {
      errors.push(new CompilerError(sourceOrInline[0].keyword, ErrorCode.NoRuntimeDefinedForHook));
    }

    const argIdentifiers = kindFilter(hook.atoms, "arg_expr", "arg_query").map(({ name }) => name);
    noDuplicateNames(argIdentifiers, ErrorCode.DuplicateHookArg);

    kindFilter(hook.atoms, "arg_query").forEach(({ query }) => checkQuery(query));
  }

  function checkSelect(select: Select) {
    const identifiers = select.map(({ target, select }) => {
      if (select) checkSelect(select);
      return target.kind === "short" ? target.name.identifier : target.name;
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
