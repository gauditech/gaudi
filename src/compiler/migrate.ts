import _ from "lodash";
import { match } from "ts-pattern";

import * as AST from "./ast/ast";

import { kindFilter, kindFind } from "@src/common/kindFilter";
import { ensureExists } from "@src/common/utils";
import { PrimitiveType } from "@src/compiler/ast/type";
import {
  AUTH_TARGET_MODEL_NAME,
  ActionAtomSpecDeny,
  ActionAtomSpecInputList,
  ActionAtomSpecRefThrough,
  ActionAtomSpecSet,
  ActionAtomSpecVirtualInput,
  ActionHookSpec,
  ActionSpec,
  AuthenticatorSpec,
  ComputedSpec,
  EndpointSpec,
  EntrypointSpec,
  ExecutionRuntimeSpec,
  ExpSpec,
  FieldSpec,
  FieldValidatorHookSpec,
  GeneratorSpec,
  HookCodeSpec,
  InputFieldSpec,
  ModelActionSpec,
  ModelHookSpec,
  ModelSpec,
  PopulateSetterSpec,
  PopulateSpec,
  PopulatorSpec,
  QuerySpec,
  ReferenceSpec,
  RelationSpec,
  RepeaterSpec,
  SelectAST,
  Specification,
  ValidatorSpec,
} from "@src/types/specification";

export function migrate(projectASTs: AST.ProjectASTs): Specification {
  const document = _.concat(...Object.values(projectASTs.plugins), projectASTs.document);
  const authenticator = kindFind(document, "authenticator");
  const specification: Specification = {
    models: kindFilter(document, "model").map(migrateModel),
    entrypoints: kindFilter(document, "entrypoint").map(migrateEntrypoint),
    populators: kindFilter(document, "populator").map(migratePopulator),
    runtimes: kindFilter(document, "runtime").map(migrateRuntime),
    authenticator: authenticator ? migrateAuthenticator(authenticator) : undefined,
    generators: kindFilter(document, "generator").map(migrateGenerator),
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
    fields,
    references,
    relations,
    queries,
    computeds,
    hooks,
  };
}

function migrateField(field: AST.Field): FieldSpec {
  const type = kindFind(field.atoms, "type")!.identifier.text;
  const default_ = kindFind(field.atoms, "default");
  const unique = kindFind(field.atoms, "unique");
  const nullable = kindFind(field.atoms, "nullable");
  const validators = kindFilter(field.atoms, "validate").flatMap((v) =>
    v.validators.map(migrateValidator)
  );

  return {
    name: field.name.text,
    type: type === "string" ? "text" : type,
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

function migrateQuery(query: AST.Query | AST.AnonymousQuery): QuerySpec {
  const from = kindFind(query.atoms, "from");
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
    name: query.kind === "query" ? query.name.text : "$query",
    fromModel: from?.identifierPath.map((i) => i.identifier.text) ?? [],
    fromAlias: from?.as?.identifierPath.map((i) => i.identifier.text),
    filter: filter ? migrateExpr(filter.expr) : undefined,
    orderBy,
    limit: limit?.value.value,
    offset: offset?.value.value,
    select: select ? migrateSelect(select.select) : undefined,
    aggregate: aggregate ? { name: aggregate.aggregate } : undefined,
  };
}

function migrateComputed(computed: AST.Computed): ComputedSpec {
  const exprType = computed.expr.type;
  const nullable = exprType.kind === "nullable";
  const targetType = nullable ? exprType.type : exprType;
  // this type should resolve only to primitive or unknown (see resolver)
  const type = targetType.kind === "primitive" ? targetType.primitiveKind : "unknown";

  return {
    name: computed.name.text,
    exp: migrateExpr(computed.expr),
    type: type === "string" ? "text" : type,
    nullable,
  };
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
  const pageable = kindFind(endpoint.atoms, "pageable");
  const orderBy = kindFind(endpoint.atoms, "orderBy")?.orderBy.map((a) => ({
    field: a.identifierPath.map((i) => i.identifier.text),
    order: a.order,
  }));

  return {
    type: endpoint.type,
    actions,
    authorize: authorize ? migrateExpr(authorize.expr) : undefined,
    method: method?.method,
    cardinality: cardinality?.cardinality,
    path: path?.path.value,
    pageable: pageable != null,
    orderBy,
  };
}

function migrateAction(action: AST.Action): ActionSpec {
  return match(action)
    .with({ kind: "create" }, { kind: "update" }, migrateModelAction)
    .with({ kind: "delete" }, migrateDeleteAction)
    .with({ kind: "execute" }, migrateExecuteAction)
    .with({ kind: "fetch" }, migrateFetchAction)
    .exhaustive();
}

function migrateModelAction(action: AST.ModelAction): ModelActionSpec {
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
      .with({ kind: "virtualInput" }, migrateActionAtomVirtualInput)
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

  if (!action.target && action.as) {
    return {
      kind: action.kind,
      targetPath: [action.as?.identifier.identifier.text],
      alias: undefined,
      actionAtoms,
    };
  }

  return {
    kind: action.kind,
    targetPath: action.target?.map((i) => i.identifier.text),
    alias: action.as?.identifier.identifier.text,
    actionAtoms,
  };
}

function migrateDeleteAction(action: AST.DeleteAction): ActionSpec {
  return { kind: "delete", targetPath: action.target?.map((i) => i.identifier.text) };
}

function migrateExecuteAction(action: AST.ExecuteAction): ActionSpec {
  const atoms = kindFilter(action.atoms, "virtualInput").map(migrateActionAtomVirtualInput);

  return {
    kind: "execute",
    alias: action.name?.text,
    hook: migrateActionHook(kindFind(action.atoms, "hook")!),
    responds: !!kindFind(action.atoms, "responds"),
    atoms,
  };
}

function migrateFetchAction(action: AST.FetchAction): ActionSpec {
  const atoms = kindFilter(action.atoms, "virtualInput").map(migrateActionAtomVirtualInput);

  return {
    kind: "fetch",
    alias: action.name?.text,
    query: migrateQuery(kindFind(action.atoms, "anonymousQuery")!),
    atoms,
  };
}

function migrateActionAtomSet(set: AST.ActionAtomSet): ActionAtomSpecSet {
  return {
    kind: "set",
    target: set.target.identifier.text,
    set:
      set.set.kind === "expr"
        ? { kind: "expression", exp: migrateExpr(set.set.expr) }
        : { kind: "hook", hook: migrateActionHook(set.set) },
  };
}

function migrateActionAtomVirtualInput({
  name,
  atoms,
}: AST.ActionAtomVirtualInput): ActionAtomSpecVirtualInput {
  const validators = kindFilter(atoms, "validate").flatMap((v) =>
    v.validators.map(migrateValidator)
  );
  const type = kindFind(atoms, "type")!.identifier.text;
  return {
    kind: "virtual-input",
    name: name.text,
    type: type === "string" ? "text" : type,
    nullable: !!kindFind(atoms, "nullable"),
    optional: false,
    validators,
  };
}

function migratePopulator(populator: AST.Populator): PopulatorSpec {
  return { name: populator.name.text, populates: populator.atoms.map(migratePopulate) };
}

function migratePopulate(populate: AST.Populate): PopulateSpec {
  const from = kindFind(populate.atoms, "target")!;
  const setters = kindFilter(populate.atoms, "set").map(migratePopulateSetter);
  const populates = kindFilter(populate.atoms, "populate").map(migratePopulate);
  const repeater = kindFind(populate.atoms, "repeat")?.repeater;

  return {
    name: populate.name.text,
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

function migratePopulateSetter(set: AST.ActionAtomSet): PopulateSetterSpec {
  return {
    kind: "set",
    target: set.target.identifier.text,
    set:
      set.set.kind === "expr"
        ? { kind: "expression", exp: migrateExpr(set.set.expr) }
        : { kind: "hook", hook: migrateActionHook(set.set) },
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

function migrateRuntime(runtime: AST.Runtime): ExecutionRuntimeSpec {
  const sourcePath = kindFind(runtime.atoms, "sourcePath")?.path.value;
  ensureExists(sourcePath, "Runtime source path cannot be empty");
  return {
    name: runtime.name.text,
    sourcePath,
    default: !!kindFind(runtime.atoms, "default"),
  };
}

function migrateAuthenticator(_authenticator: AST.Authenticator): AuthenticatorSpec {
  const authUserModelName = AUTH_TARGET_MODEL_NAME;
  const accessTokenModelName = `${authUserModelName}AccessToken`;

  return { authUserModelName, accessTokenModelName, method: { kind: "basic" } };
}

function migrateGenerator(generator: AST.Generator): GeneratorSpec {
  return match(generator)
    .with({ type: "client" }, (g) => {
      const target = kindFind(g.atoms, "target")!.value;
      const api = kindFind(g.atoms, "api")!.value;
      const output = kindFind(g.atoms, "output")?.value.value;

      return {
        kind: "generator-client" as const,
        target,
        api,
        output,
      };
    })
    .exhaustive();
}

function migrateModelHook(hook: AST.ModelHook): ModelHookSpec {
  const code = getHookCode(hook);
  // model spec does not support expression hooks
  const _args = kindFilter(hook.atoms, "arg_expr").map((a) => ({ name: a.name.text }));
  const args = kindFilter(hook.atoms, "arg_query").map((a) => ({
    name: a.name.text,
    query: migrateQuery(a.query),
  }));
  return { name: hook.name.text, code, args, runtimeName: getHookRuntime(hook) };
}

function migrateFieldValidationHook(hook: AST.FieldValidationHook): FieldValidatorHookSpec {
  const code = getHookCode(hook);
  const arg = kindFind(hook.atoms, "default_arg");
  return { code, arg: arg?.name.text, runtimeName: getHookRuntime(hook) };
}

function migrateActionHook(hook: AST.ActionHook): ActionHookSpec {
  const code = getHookCode(hook);
  const args: ActionHookSpec["args"] = {};
  kindFilter(hook.atoms, "arg_expr").forEach((a) => {
    args[a.name.text] = { kind: "expression", exp: migrateExpr(a.expr) };
  });
  kindFilter(hook.atoms, "arg_query").map((a) => {
    args[a.name.text] = { kind: "query", query: migrateQuery(a.query) };
  });
  return { code, args, runtimeName: getHookRuntime(hook) };
}

function getHookCode(hook: AST.Hook<boolean, boolean>): HookCodeSpec {
  const inline = kindFind(hook.atoms, "inline");
  if (inline) {
    return { kind: "inline", inline: inline.code.value };
  }
  const source = kindFind(hook.atoms, "source")!;
  return { kind: "source", target: source.name.text, file: source.file.value };
}

function getHookRuntime(hook: AST.Hook<boolean, boolean>): string | undefined {
  const runtime = kindFind(hook.atoms, "runtime");
  if (runtime) {
    return runtime.identifier.text;
  }
  return undefined;
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
    case "binary": {
      // NOTE this is a quick fix to convert "+" to "concat" when strings are involved
      if (
        expr.lhs.type.kind === "primitive" &&
        expr.lhs.type.primitiveKind === "string" &&
        expr.operator === "+"
      ) {
        return {
          kind: "function",
          name: "concat",
          args: [migrateExpr(expr.lhs), migrateExpr(expr.rhs)],
        };
      }
      return {
        kind: "binary",
        operator: expr.operator,
        lhs: migrateExpr(expr.lhs),
        rhs: migrateExpr(expr.rhs),
      };
    }
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
