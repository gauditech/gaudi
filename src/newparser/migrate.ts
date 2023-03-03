import { match } from "ts-pattern";

import * as AST from "./ast/ast";

import { kindFilter, kindFind } from "@src/common/patternFilter";
import { SelectAST } from "@src/types/ast";
import {
  ActionAtomSpecDeny,
  ActionAtomSpecInputList,
  ActionAtomSpecRefThrough,
  ActionAtomSpecSet,
  ActionHookSpec,
  ActionSpec,
  ComputedSpec,
  EndpointSpec,
  EntrypointSpec,
  ExpSpec,
  FieldSpec,
  FieldValidatorHookSpec,
  HookCodeSpec,
  InputFieldSpec,
  ModelHookSpec,
  ModelSpec,
  PopulateSpec,
  PopulatorSpec,
  QuerySpec,
  ReferenceSpec,
  RelationSpec,
  RepeaterSpec,
  Specification,
  ValidatorSpec,
} from "@src/types/specification";

export function migrate(definition: AST.Definition): Specification {
  const specification: Specification = {
    models: kindFilter(definition, "model").map(migrateModel),
    entrypoints: kindFilter(definition, "entrypoint").map(migrateEntrypoint),
    populators: kindFilter(definition, "populator").map(migratePopulator),
    runtimes: [],
  };

  return specification;
}

function migrateModel(model: AST.Model): ModelSpec {
  const fields = kindFilter(model.atoms, "field").map(migrateField);
  const references = kindFilter(model.atoms, "reference").map(migrateReference);
  const relations = kindFilter(model.atoms, "relation").map(migrateRelation);
  const queries = kindFilter(model.atoms, "query").map(migrateQuery);
  const computeds = kindFilter(model.atoms, "computed").map(migrateComputed);
  const hooks = kindFilter(model.atoms, "hook").map(migrateModelHook);

  return {
    name: model.name.text,
    isAuth: false,
    fields,
    references,
    relations,
    queries,
    computeds,
    hooks,
  };
}

function migrateField(field: AST.Field): FieldSpec {
  const type = kindFind(field.atoms, "type")!;
  const default_ = kindFind(field.atoms, "default");
  const unique = kindFind(field.atoms, "unique");
  const nullable = kindFind(field.atoms, "nullable");
  const validators = kindFilter(field.atoms, "validate").flatMap((v) =>
    v.validators.map(migrateValidator)
  );

  return {
    name: field.name.text,
    type: type.identifier.text,
    default: default_?.literal.value,
    unique: !!unique,
    nullable: !!nullable,
    validators: validators,
  };
}

function migrateValidator(validator: AST.Validator): ValidatorSpec {
  if (validator.kind === "builtin") {
    return { kind: "builtin", name: validator.name.text, args: validator.args.map((a) => a.value) };
  } else {
    return { kind: "hook", hook: migrateFieldValidationHook(validator) };
  }
}

function migrateReference(reference: AST.Reference): ReferenceSpec {
  const to = kindFind(reference.atoms, "to")!;
  const unique = kindFind(reference.atoms, "unique");
  const nullable = kindFind(reference.atoms, "nullable");

  return {
    name: reference.name.text,
    toModel: to.identifier.identifier.text,
    unique: !!unique,
    nullable: !!nullable,
  };
}

function migrateRelation(relation: AST.Relation): RelationSpec {
  const from = kindFind(relation.atoms, "from")!;
  const through = kindFind(relation.atoms, "through")!;

  return {
    name: relation.name.text,
    fromModel: from.identifier.identifier.text,
    through: through.identifier.identifier.text,
  };
}

function migrateQuery(query: AST.Query): QuerySpec {
  const from = kindFind(query.atoms, "from")!;
  const filter = kindFind(query.atoms, "filter");
  const orderBy = kindFind(query.atoms, "orderBy")?.orderBy.map((a) => ({
    field: a.identifierPath.map((i) => i.identifier.text),
    order: a.order,
  }));
  const limit = kindFind(query.atoms, "limit");
  const offset = kindFind(query.atoms, "offset");
  const select = kindFind(query.atoms, "select");
  const aggregate = kindFind(query.atoms, "aggregate");

  return {
    name: query.name.text,
    fromModel: from.identifierPath.map((i) => i.identifier.text),
    fromAlias: from.as?.identifierPath.map((i) => i.identifier.text),
    filter: filter ? migrateExpr(filter.expr) : undefined,
    orderBy,
    limit: limit?.value.value,
    offset: offset?.value.value,
    select: select ? migrateSelect(select.select) : undefined,
    aggregate: aggregate ? { name: aggregate.aggregate } : undefined,
  };
}

function migrateComputed(computed: AST.Computed): ComputedSpec {
  return { name: computed.name.text, exp: migrateExpr(computed.expr) };
}

function migrateEntrypoint(entrypoint: AST.Entrypoint): EntrypointSpec {
  const from = kindFind(entrypoint.atoms, "target")!;
  const identify = kindFind(entrypoint.atoms, "identifyWith");
  const response = kindFind(entrypoint.atoms, "response");
  const authorize = kindFind(entrypoint.atoms, "authorize");
  const endpoints = kindFilter(entrypoint.atoms, "endpoint").map(migrateEndpoint);
  const entrypoints = kindFilter(entrypoint.atoms, "entrypoint").map(migrateEntrypoint);

  return {
    name: entrypoint.name.text,
    target: {
      kind: from.identifier.ref.kind === "model" ? "model" : "relation",
      identifier: from.identifier.identifier.text,
      alias: from.as?.identifier.identifier.text,
    },
    identify: identify?.identifier.identifier.text,
    response: response ? migrateSelect(response.select) : undefined,
    authorize: authorize ? migrateExpr(authorize.expr) : undefined,
    endpoints,
    entrypoints,
  };
}

function migrateEndpoint(endpoint: AST.Endpoint): EndpointSpec {
  const actions = kindFind(endpoint.atoms, "action")?.actions.map(migrateAction);
  const authorize = kindFind(endpoint.atoms, "authorize");
  const method = kindFind(endpoint.atoms, "method");
  const cardinality = kindFind(endpoint.atoms, "cardinality");
  const path = kindFind(endpoint.atoms, "path");

  return {
    type: endpoint.type,
    actions,
    authorize: authorize ? migrateExpr(authorize.expr) : undefined,
    method: method?.method,
    cardinality: cardinality?.cardinality,
    path: path?.path.value,
  };
}

function migrateAction(action: AST.Action): ActionSpec {
  const actionAtoms = action.atoms.map((a) =>
    match(a)
      .with({ kind: "set" }, migrateActionAtomSet)
      .with(
        { kind: "referenceThrough" },
        ({ target, through }): ActionAtomSpecRefThrough => ({
          kind: "reference",
          target: target.identifier.text,
          through: through.identifier.text,
        })
      )
      .with(
        { kind: "deny" },
        ({ fields }): ActionAtomSpecDeny => ({
          kind: "deny",
          fields: fields.kind === "all" ? "*" : fields.fields.map((i) => i.identifier.text),
        })
      )
      .with(
        { kind: "input" },
        ({ fields }): ActionAtomSpecInputList => ({
          kind: "input-list",
          fields: fields.map(({ field, atoms }) => {
            const optional = kindFind(atoms, "optional");
            const default_ = kindFind(atoms, "default")?.value;
            let migratedDefault: InputFieldSpec["default"];
            if (default_) {
              if (default_.kind === "literal") {
                migratedDefault = { kind: "literal", value: default_.literal.value };
              } else if (default_.kind === "path") {
                migratedDefault = {
                  kind: "reference",
                  reference: default_.path.map((i) => i.identifier.text),
                };
              } else {
                throw Error("Default input as expression is not supported in spec");
              }
            }
            return { name: field.identifier.text, optional: !!optional, default: migratedDefault };
          }),
        })
      )
      .exhaustive()
  );

  return {
    kind: action.kind,
    targetPath: action.target?.map((i) => i.identifier.text),
    alias: action.as?.identifier.identifier.text,
    actionAtoms,
  };
}

function migratePopulator(populator: AST.Populator): PopulatorSpec {
  return { name: populator.name.text, populates: populator.atoms.map(migratePopulate) };
}

function migratePopulate(populate: AST.Populate): PopulateSpec {
  const from = kindFind(populate.atoms, "target")!;
  const setters = kindFilter(populate.atoms, "set").map(migrateActionAtomSet);
  const populates = kindFilter(populate.atoms, "populate").map(migratePopulate);
  const repeater = kindFind(populate.atoms, "repeat")?.repeater;

  return {
    name: "",
    target: {
      kind: from.identifier.ref.kind === "model" ? "model" : "relation",
      identifier: from.identifier.identifier.text,
      alias: from.as?.identifier.identifier.text,
    },
    setters,
    populates,
    repeater: repeater ? migrateRepeater(repeater) : undefined,
  };
}

function migrateRepeater(repeater: AST.Repeater): RepeaterSpec {
  switch (repeater.kind) {
    case "simple":
      return { kind: "fixed", value: repeater.value.value, alias: repeater.name?.text };
    case "body": {
      const start = kindFind(repeater.atoms, "start")?.value.value;
      const end = kindFind(repeater.atoms, "end")?.value.value;
      return { kind: "range", range: { start, end }, alias: repeater.name?.text };
    }
  }
}

function migrateActionAtomSet(set: AST.ActionAtomSet): ActionAtomSpecSet {
  return {
    kind: "set",
    target: set.target.identifier.text,
    set:
      set.set.kind === "expr"
        ? { kind: "expression", exp: migrateExpr(set.set.expr) }
        : { kind: "hook", hook: migrateActionFieldHook(set.set) },
  };
}

function migrateModelHook(hook: AST.ModelHook): ModelHookSpec {
  const code = getHookCode(hook);
  const _args = kindFilter(hook.atoms, "arg_expr").map((a) => ({ name: a.name.text }));
  // TODO spec does not support expressions AND newparser does not support queries
  return { name: hook.name.text, code, args: [] };
}

function migrateFieldValidationHook(hook: AST.FieldValidationHook): FieldValidatorHookSpec {
  const code = getHookCode(hook);
  const arg = kindFind(hook.atoms, "default_arg");
  return { code, arg: arg?.name.text };
}

function migrateActionFieldHook(hook: AST.ActionFieldHook): ActionHookSpec {
  const code = getHookCode(hook);
  const args: ActionHookSpec["args"] = {};
  kindFilter(hook.atoms, "arg_expr").forEach((a) => {
    args[a.name.text] = { kind: "expression", exp: migrateExpr(a.expr) };
  });
  return { code, args };
}

function getHookCode(hook: AST.Hook<boolean, boolean>): HookCodeSpec {
  const inline = kindFind(hook.atoms, "inline");
  if (inline) {
    return { kind: "inline", inline: inline.code.value };
  }
  const source = kindFind(hook.atoms, "source")!;
  return { kind: "source", target: source.name.text, file: source.file.value };
}

function migrateSelect(select: AST.Select): SelectAST {
  const migrated: Record<string, SelectAST> = {};
  select.forEach((s) => {
    if (s.target.kind === "long") {
      throw Error("Long select form unsupported in old spec");
    }
    migrated[s.target.name.identifier.text] = s.select ? migrateSelect(s.select) : {};
  });
  return { select: migrated };
}

function migrateExpr(expr: AST.Expr): ExpSpec {
  switch (expr.kind) {
    case "binary":
      return {
        kind: "binary",
        operator: expr.operator,
        lhs: migrateExpr(expr.lhs),
        rhs: migrateExpr(expr.rhs),
      };
    case "group":
      return migrateExpr(expr.expr);
    case "unary":
      return { kind: "unary", operator: expr.operator, exp: migrateExpr(expr.expr) };
    case "path":
      return { kind: "identifier", identifier: expr.path.map((i) => i.identifier.text) };
    case "literal":
      return { kind: "literal", literal: expr.literal.value };
    case "function":
      return { kind: "function", name: expr.name.text, args: expr.args.map(migrateExpr) };
  }
}
