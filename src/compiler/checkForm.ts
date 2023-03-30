import { match } from "ts-pattern";

import {
  Action,
  ActionAtomVirtualInput,
  AnonymousQuery,
  Authenticator,
  Computed,
  Endpoint,
  EndpointType,
  Entrypoint,
  ExecuteAction,
  FetchAction,
  Field,
  GlobalAtom,
  Hook,
  Identifier,
  Model,
  ModelAction,
  Populate,
  Populator,
  ProjectASTs,
  Query,
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
      containsAtoms(runtime, "sourcePath");
      noDuplicateAtoms(runtime, "default", "sourcePath");
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
        .with({ kind: "entrypoint" }, checkEntrypoint)
        .with({ kind: "populator" }, checkPopulator)
        .with({ kind: "runtime" }, () => undefined) // runtime is checked first
        .with({ kind: "authenticator" }, () => checkAuthenticator)
        .exhaustive()
    );
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
    containsAtoms(field, "type");
    noDuplicateAtoms(field, "type", "default", "nullable", "unique", "validate");

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
    containsAtoms(reference, "to");
    noDuplicateAtoms(reference, "to", "nullable", "unique");
  }

  function checkRelation(relation: Relation) {
    containsAtoms(relation, "from", "through");
    noDuplicateAtoms(relation, "from", "through");
  }

  function checkQuery(query: Query | AnonymousQuery) {
    if (query.kind === "query") {
      containsAtoms(query, "from");
    }
    noDuplicateAtoms(query, "from", "filter", "orderBy", "limit", "offset", "select", "aggregate");

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
    containsAtoms(entrypoint, "target");
    noDuplicateAtoms(entrypoint, "target", "identifyWith", "authorize", "response");

    entrypoint.atoms.forEach((a) =>
      match(a)
        .with({ kind: "response" }, ({ select }) => checkSelect(select))
        .with({ kind: "endpoint" }, checkEndpoint)
        .with({ kind: "entrypoint" }, checkEntrypoint)
        .otherwise(() => {
          // TODO: do nothing?
        })
    );
  }

  function checkEndpoint(endpoint: Endpoint) {
    noDuplicateAtoms(endpoint, "action", "authorize", "method", "cardinality", "path");

    if (endpoint.type === "custom") {
      containsAtoms(endpoint, "method", "cardinality", "path");
    } else {
      const customAtoms = kindFilter(endpoint.atoms, "method", "cardinality", "path");
      if (customAtoms.length > 0) {
        errors.push(
          new CompilerError(customAtoms[0].keyword, ErrorCode.ConfiguringNonCustomEndpoint)
        );
      }
    }

    const action = kindFind(endpoint.atoms, "action");
    if (action) action.actions.map((a) => checkAction(a, endpoint.type));
  }

  function checkAction(action: Action, endpointType: EndpointType) {
    match(action)
      .with({ kind: "create" }, { kind: "update" }, checkModelAction)
      .with({ kind: "delete" }, () => undefined)
      .with({ kind: "execute" }, (a) => checkExecuteAction(a, endpointType))
      .with({ kind: "fetch" }, checkFetchAction)
      .exhaustive();
  }

  function checkModelAction(action: ModelAction) {
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
            noDuplicateAtoms({ ...field, kind: "input" }, "optional", "default");
            return field.field.identifier;
          })
        )
        .exhaustive()
    );
    noDuplicateNames(allIdentifiers, ErrorCode.DuplicateActionAtom);
  }

  function checkExecuteAction(action: ExecuteAction, endpointType: EndpointType) {
    containsAtoms(action, "hook");
    noDuplicateAtoms(action, "hook", "responds");
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
    containsAtoms(action, "anonymousQuery");
    const allIdentifiers = kindFilter(action.atoms, "virtualInput").map((virtualInput) => {
      checkActionAtomVirtualInput(virtualInput);
      return virtualInput.name;
    });
    noDuplicateNames(allIdentifiers, ErrorCode.DuplicateActionAtom);

    const query = kindFind(action.atoms, "anonymousQuery");
    if (query) checkQuery(query);
  }

  function checkActionAtomVirtualInput(virtualInput: ActionAtomVirtualInput) {
    containsAtoms(virtualInput, "type");
    noDuplicateAtoms(virtualInput, "type", "nullable", "validate");
    kindFilter(virtualInput.atoms, "validate").map(({ validators }) =>
      validators.forEach(checkValidator)
    );
  }

  function checkPopulator(populator: Populator) {
    populator.atoms.map(checkPopulate);
  }

  function checkPopulate(populate: Populate) {
    containsAtoms(populate, "target");
    noDuplicateAtoms(populate, "target", "repeat");
    const setIdentifiers = kindFilter(populate.atoms, "set").map(({ target, set }) => {
      if (set.kind === "hook") checkHook(set);
      return target.identifier;
    });
    noDuplicateNames(setIdentifiers, ErrorCode.DuplicatePopulateSet);
    kindFilter(populate.atoms, "populate").forEach(checkPopulate);
  }

  function checkAuthenticator(authenticator: Authenticator) {
    containsAtoms(authenticator, "method");
    noDuplicateAtoms(authenticator, "method");
  }

  function checkHook(hook: Hook<boolean, boolean>) {
    noDuplicateAtoms(hook, "default_arg", "runtime");
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
    return identifiers.flatMap(({ text, token }) => {
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
  >(parent: ast, ...kinds: k[]) {
    kinds.forEach((kind) => {
      const filteredAtoms = parent.atoms.filter((a) => a.kind === kind);
      if (filteredAtoms.length === 0) {
        errors.push(
          new CompilerError(parent.keyword, ErrorCode.MustContainAtom, {
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
  >(parent: ast, ...kinds: k[]) {
    kinds.forEach((kind) => {
      const filteredAtoms = parent.atoms.filter((a) => a.kind === kind);
      if (filteredAtoms.length > 1) {
        const [_first, ...other] = filteredAtoms;
        other.forEach((a) => {
          errors.push(
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
