import { match } from "ts-pattern";

import {
  Action,
  ActionVirtualInput,
  Computed,
  Definition,
  Endpoint,
  Entrypoint,
  Field,
  Hook,
  Identifier,
  Model,
  Populate,
  Populator,
  Query,
  Reference,
  Relation,
  Select,
  TokenData,
  Validator,
} from "./ast/ast";
import { CompilerError, ErrorCode } from "./compilerError";

import { kindFilter, kindFind } from "@src/common/patternFilter";

export function checkForm(definition: Definition) {
  const errors: CompilerError[] = [];

  function checkDefinition(definition: Definition) {
    noDuplicateNames(
      kindFilter(definition, "model").map(({ name }) => name),
      ErrorCode.DuplicateModel
    );

    definition.forEach((d) =>
      match(d)
        .with({ kind: "model" }, checkModel)
        .with({ kind: "entrypoint" }, checkEntrypoint)
        .with({ kind: "populator" }, checkPopulator)
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

  function checkQuery(query: Query) {
    containsAtoms(query, ["from"]);
    noDuplicateAtoms(query, [
      "from",
      "filter",
      "orderBy",
      "limit",
      "offset",
      "aggregate",
      "select",
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
    containsAtoms(entrypoint, ["target"]);
    noDuplicateAtoms(entrypoint, ["target", "identifyWith", "authorize", "response"]);

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
    noDuplicateAtoms(endpoint, ["action", "authorize", "method", "cardinality", "path"]);

    const action = kindFind(endpoint.atoms, "action");
    if (action) action.actions.map(checkAction);
  }

  function checkAction(action: Action) {
    const allIdentifiers = action.atoms.flatMap((a) =>
      match(a)
        .with({ kind: "set" }, ({ target, set }) => {
          if (set.kind === "hook") checkHook(set);
          return [target.identifier];
        })
        .with({ kind: "referenceThrough" }, ({ target }) => [target.identifier])
        .with({ kind: "virtualInput" }, (virtualInput) => {
          checkActionVirtualInput(virtualInput);
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

  function checkActionVirtualInput(virtualInput: ActionVirtualInput) {
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
    containsAtoms(populate, ["target"]);
    noDuplicateAtoms(populate, ["target", "repeat"]);
    const setIdentifiers = kindFilter(populate.atoms, "set").map(({ target, set }) => {
      if (set.kind === "hook") checkHook(set);
      return target.identifier;
    });
    noDuplicateNames(setIdentifiers, ErrorCode.DuplicatePopulateSet);
    kindFilter(populate.atoms, "populate").forEach(checkPopulate);
  }

  function checkHook(hook: Hook<boolean, boolean>) {
    const sourceOrInline = [
      ...kindFilter(hook.atoms, "source"),
      ...kindFilter(hook.atoms, "inline"),
    ];
    if (sourceOrInline.length === 0) {
      errors.push(new CompilerError(hook.keyword, ErrorCode.HookMustContainSourceOrInline));
    } else if (sourceOrInline.length > 1) {
      sourceOrInline.forEach(({ keyword }) =>
        errors.push(new CompilerError(keyword, ErrorCode.HookOnlyOneSourceOrInline))
      );
    }
    noDuplicateAtoms(hook, ["default_arg"]);
    const argIdentifiers = kindFilter(hook.atoms, "arg_expr").map(({ name }) => name);
    noDuplicateNames(argIdentifiers, ErrorCode.DuplicateHookArg);
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
      }
    });
  }

  function containsAtoms<
    ast extends { kind: string; keyword: TokenData; atoms: { kind: string }[] },
    k extends ast["atoms"][number]["kind"]
  >(parent: ast, kinds: k[]) {
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
  >(parent: ast, kinds: k[]) {
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

  checkDefinition(definition);

  return errors;
}
