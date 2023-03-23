import _ from "lodash";

import { CompilerError } from "@src/common/error";
import { FilteredKind, kindFilter, kindFind } from "@src/common/patternFilter";
import { UnreachableError, assertUnreachable, ensureEqual, ensureExists } from "@src/common/utils";
import {
  AST,
  AnyActionAtomAST,
  AnyActionBodyAST,
  AuthenticatorAST,
  AuthenticatorBodyAtomAST,
  AuthenticatorMethodBodyAtomAST,
  ComputedAST,
  EndpointAST,
  EndpointCardinality,
  EndpointMethod,
  EndpointTypeAST,
  EntrypointAST,
  ExecutionRuntimeAST,
  ExpAST,
  FieldAST,
  GeneratorAST,
  HookAST,
  InputFieldOptAST,
  LiteralValue,
  ModelAST,
  PopulateAST,
  PopulatorAST,
  QueryAST,
  ReferenceAST,
  RelationAST,
  ValidatorAST,
  VirtualInputAST,
  VirtualInputAtomASTType,
  VirtualInputAtomASTValidator,
} from "@src/types/ast";
import {
  AUTH_TARGET_MODEL_NAME,
  ActionAtomSpecSet,
  ActionAtomSpecVirtualInput,
  ActionHookSpec,
  ActionSpec,
  AuthenticatorMethodSpec,
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
  HookSpec,
  InputFieldSpec,
  ModelActionAtomSpec,
  ModelHookSpec,
  ModelSpec,
  PopulateSetterSpec,
  PopulateSpec,
  PopulatorSpec,
  QuerySpec,
  ReferenceSpec,
  RelationSpec,
  RepeaterSpec,
  Specification,
  ValidatorSpec,
} from "@src/types/specification";

function compileField(field: FieldAST): FieldSpec {
  let type: string | undefined;
  let default_: LiteralValue | undefined;
  let nullable: boolean | undefined;
  let unique: boolean | undefined;
  let validators: ValidatorSpec[] | undefined;

  field.body.forEach((b) => {
    if (b.kind === "tag") {
      if (b.tag === "nullable") {
        nullable = true;
      } else if (b.tag === "unique") {
        unique = true;
      }
    } else if (b.kind === "type") {
      type = b.type;
    } else if (b.kind === "default") {
      default_ = b.default;
    } else if (b.kind === "validate") {
      // FIXME multiple `validate` blocks override the previous ones
      validators = b.validators.map(compileValidator);
    }
  });

  if (type === undefined) {
    throw new CompilerError("'field' has no 'type'", field);
  }

  return {
    name: field.name,
    type,
    default: default_,
    nullable,
    unique,
    validators,
    interval: field.interval,
  };
}

function compileValidator(validator: ValidatorAST): ValidatorSpec {
  switch (validator.kind) {
    case "builtin":
      return validator;
    case "hook":
      return { ...validator, hook: compileFieldValidatorHook(validator.hook) };
  }
}

function compileReference(reference: ReferenceAST): ReferenceSpec {
  let toModel: string | undefined;
  let nullable: boolean | undefined;
  let unique: boolean | undefined;

  reference.body.forEach((b) => {
    if (b.kind === "tag") {
      if (b.tag === "nullable") {
        nullable = true;
      } else if (b.tag === "unique") {
        unique = true;
      }
    } else if (b.kind === "to") {
      toModel = b.to;
    }
  });

  if (toModel === undefined) {
    throw new CompilerError("'reference' has no 'to' model", reference);
  }

  return { name: reference.name, toModel, nullable, unique, interval: reference.interval };
}

function compileRelation(relation: RelationAST): RelationSpec {
  let fromModel: string | undefined;
  let through: string | undefined;

  relation.body.forEach((b) => {
    if (b.kind === "from") {
      fromModel = b.from;
    } else if (b.kind === "through") {
      through = b.through;
    }
  });

  if (fromModel === undefined) {
    throw new CompilerError("'relation' has no 'from' model", relation);
  }
  if (through === undefined) {
    throw new CompilerError("'relation' has no 'through'", relation);
  }

  return { name: relation.name, fromModel, through, interval: relation.interval };
}

function compileQuery(query: QueryAST, defaultFromModel?: string[]): QuerySpec {
  let fromModel: string[] | undefined = defaultFromModel;
  let fromAlias: string[] | undefined;
  let filter: ExpSpec | undefined;
  let orderBy: QuerySpec["orderBy"];
  let limit: number | undefined;
  let offset: number | undefined;
  let select: QuerySpec["select"];
  let aggregate: QuerySpec["aggregate"];

  query.body.forEach((b) => {
    if (b.kind === "from") {
      fromModel = b.from;
      fromAlias = b.alias;
    } else if (b.kind === "filter") {
      filter = compileQueryExp(b.filter);
    } else if (b.kind === "orderBy") {
      orderBy = b.orderings;
    } else if (b.kind === "limit") {
      limit = b.limit;
    } else if (b.kind === "offset") {
      offset = b.offset;
    } else if (b.kind === "select") {
      select = b.select;
    } else if (b.kind === "aggregate") {
      aggregate = { name: b.name };
    }
  });

  if (fromModel === undefined) {
    throw new CompilerError("'query' has no 'from'", query);
  }

  if (limit === undefined && offset !== undefined) {
    throw new CompilerError(
      `Can't use offset without limit`,
      query.body.find((a) => a.kind === "offset")
    );
  }

  return {
    name: query.name,
    fromModel,
    fromAlias,
    filter,
    interval: query.interval,
    orderBy,
    limit,
    offset,
    select,
    aggregate,
  };
}

function compileComputed(computed: ComputedAST): ComputedSpec {
  return {
    name: computed.name,
    exp: compileQueryExp(computed.exp),
    interval: computed.interval,
  };
}

function compileQueryExp(exp: ExpAST): ExpSpec {
  if (exp.kind === "paren") {
    return compileQueryExp(exp.exp);
  } else if (exp.kind === "binary") {
    return {
      kind: "binary",
      operator: exp.operator,
      lhs: compileQueryExp(exp.lhs),
      rhs: compileQueryExp(exp.rhs),
      interval: exp.interval,
    };
  } else if (exp.kind === "unary") {
    return {
      kind: "unary",
      operator: exp.operator,
      exp: compileQueryExp(exp.exp),
      interval: exp.interval,
    };
  } else if (exp.kind === "function") {
    return {
      kind: "function",
      name: exp.name,
      args: exp.args.map((arg: ExpAST) => compileQueryExp(arg)),
      interval: exp.interval,
    };
  } else {
    return exp;
  }
}

function compileModel(model: ModelAST): ModelSpec {
  const fields: FieldSpec[] = [];
  const references: ReferenceSpec[] = [];
  const relations: RelationSpec[] = [];
  const queries: QuerySpec[] = [];
  const computeds: ComputedSpec[] = [];
  const hooks: ModelHookSpec[] = [];

  model.body.forEach((b) => {
    if (b.kind === "field") {
      fields.push(compileField(b));
    } else if (b.kind === "reference") {
      references.push(compileReference(b));
    } else if (b.kind === "relation") {
      relations.push(compileRelation(b));
    } else if (b.kind === "query") {
      queries.push(compileQuery(b));
    } else if (b.kind === "computed") {
      computeds.push(compileComputed(b));
    } else if (b.kind === "hook") {
      hooks.push(compileModelHook(b));
    }
  });

  return {
    name: model.name,
    alias: model.alias,
    fields,
    references,
    relations,
    queries,
    computeds,
    hooks,
    interval: model.interval,
  };
}

function compileAnyAction(action: AnyActionBodyAST, endpointType: EndpointTypeAST): ActionSpec {
  switch (action.kind) {
    case "create":
    case "update": {
      return compileModelAction(action);
    }
    case "delete":
      return compileDeleteAction(action);
    case "fetch":
      return compileFetchAction(action);
    case "execute":
      return compileExecuteAction(action, endpointType);
  }
}

function compileModelAction(ast: AnyActionBodyAST): FilteredKind<ActionSpec, "create" | "update"> {
  if (ast.kind === "create" || ast.kind === "update") {
    // compile atoms
    return {
      kind: ast.kind,
      alias: ast.alias,
      targetPath: ast.target,
      actionAtoms: ast.atoms.map(_.unary(compileModelActionAtom)),
      // interval: ast.interval,
    };
  } else {
    throw new UnreachableError(`${ast.kind} is not a valid model action`);
  }
}

function compileDeleteAction(ast: AnyActionBodyAST): FilteredKind<ActionSpec, "delete"> {
  if (ast.kind === "delete") {
    if (ast.alias) {
      throw new CompilerError(
        `Delete target action cannot make an alias; remove "as ${ast.alias}"`,
        ast
      );
    }

    return {
      kind: ast.kind,
      targetPath: ast.target,
      // interval: ast.interval,
    };
  } else {
    throw new UnreachableError(`${ast.kind} is not a valid delete action`);
  }
}

function compileExecuteAction(
  ast: AnyActionBodyAST,
  endpointType: EndpointTypeAST
): FilteredKind<ActionSpec, "execute"> {
  if (ast.kind === "execute") {
    const atoms = ast.atoms.map((a) => {
      switch (a.kind) {
        case "virtual-input": {
          return compileVirtualInput(a);
        }
        case "responds": {
          return { kind: "responds" as const };
        }
        case "hook": {
          return { kind: "hook" as const, hook: compileActionHook(a.hook) };
        }
        // case "set": {
        //   return compileSetter(a);
        // }
        default: {
          throw new CompilerError(`${a.kind} is not a valid execute atom`, a);
        }
      }
    });

    const responds = kindFilter(atoms, "responds").length > 0;
    if (responds) {
      ensureEqual(
        _.includes<EndpointTypeAST>(["custom", "custom"], endpointType),
        true,
        `Actions with "responds" keyword are allowed only in "custom" endpoints, not in "${endpointType}"`
      );
    }
    const bodyAtoms = kindFilter(atoms, "virtual-input");
    const hook = kindFind(atoms, "hook");
    if (!hook) {
      throw new CompilerError(`Execute action must have a hook`, ast);
    }
    if (hook.hook.code.kind === "inline") {
      throw new Error(`Inline hooks cannot be used for "execute" actions`); // fixme compiler error
    }

    // do not allow any other kinds of atoms
    ast.atoms.forEach((atom) => {
      switch (atom.kind) {
        case "responds":
        case "hook":
        case "virtual-input":
          return;
        default:
          throw new CompilerError(`${atom.kind} is not a valid execute action atom`, atom);
      }
    });

    return {
      kind: ast.kind,
      alias: ast.alias,
      atoms: bodyAtoms,
      responds,
      hook: hook.hook,
      // interval: ast.interval
    };
  } else {
    throw new UnreachableError(`${ast.kind} is not a valid delete action`);
  }
}

function compileFetchAction(ast: AnyActionBodyAST): FilteredKind<ActionSpec, "fetch"> {
  const queryAtoms = kindFilter(ast.atoms, "query");

  if (queryAtoms.length === 0) {
    throw new CompilerError(`"query" atom is required in fetch actions`, ast);
  } else if (queryAtoms.length > 1) {
    throw new CompilerError(`Duplicate "query" atom found`, queryAtoms[1]);
  }
  const query = queryAtoms[0];

  const virtuals = kindFilter(ast.atoms, "virtual-input");

  // do not allow any other kinds of atoms
  ast.atoms.forEach((atom) => {
    switch (atom.kind) {
      case "query":
      case "virtual-input":
        return;
      default:
        throw new CompilerError(`${atom.kind} is not a valid execute action atom`, atom);
    }
  });

  if (ast.kind === "fetch") {
    return {
      kind: ast.kind,
      alias: ast.alias,
      query: compileQuery({ kind: "query", body: query.body, name: "$query" }),
      atoms: virtuals.map(_.unary(compileVirtualInput)),
      // interval: ast.interval,
    };
  } else {
    throw new UnreachableError(`${ast.kind} is not a valid fetch action`);
  }
}

function compileModelActionAtom(atom: AnyActionAtomAST): ModelActionAtomSpec {
  switch (atom.kind) {
    case "input": {
      const fields = atom.fields.map((f): InputFieldSpec => {
        const defaults = f.opts
          .filter((o): o is Exclude<InputFieldOptAST, { kind: "optional" }> =>
            o.kind.startsWith("default")
          )
          .map((o): InputFieldSpec["default"] => {
            switch (o.kind) {
              case "default-value": {
                return { kind: "literal", value: o.value };
              }
              case "default-reference": {
                return { kind: "reference", reference: o.path };
              }
            }
          });
        if (defaults.length > 1) {
          throw new CompilerError(`Multiple 'default' for a field is not allowed`);
        }
        const optionals = f.opts.filter((o) => o.kind === "optional");
        if (optionals.length > 1) {
          throw new CompilerError(`Multiple 'optional' for a field is not allowed`);
        }
        return { name: f.name, default: defaults[0], optional: !_.isEmpty(optionals) };
      });
      return { kind: "input-list", fields };
    }
    case "virtual-input": {
      return compileVirtualInput(atom);
    }
    case "deny":
    case "reference":
      return atom;
    case "set": {
      return compileSetter(atom);
    }
    case "hook":
    case "query":
    case "responds": {
      throw new CompilerError(`${atom.kind} is not a valid model action`, atom);
    }
    default: {
      return assertUnreachable(atom);
    }
  }
}

function compileSetter(atom: FilteredKind<AnyActionAtomAST, "set">): ActionAtomSpecSet {
  switch (atom.set.kind) {
    case "hook": {
      return { ...atom, set: { kind: "hook", hook: compileActionHook(atom.set.hook) } };
    }
    case "expression": {
      return { ...atom, set: { kind: "expression", exp: compileQueryExp(atom.set.exp) } };
    }
    case "query": {
      return {
        ...atom,
        set: { kind: "query", query: compileQuery({ ...atom.set, name: atom.target }) },
      };
    }
    default: {
      return assertUnreachable(atom.set);
    }
  }
}

function compileVirtualInput(input: VirtualInputAST): ActionAtomSpecVirtualInput {
  const validators = input.atoms
    .filter((a): a is VirtualInputAtomASTValidator => a.kind === "validate")
    .flatMap((validate) => validate.validators)
    .map(_.unary(compileValidator));

  const type = input.atoms.find((a): a is VirtualInputAtomASTType => a.kind === "type");
  if (type === undefined) {
    throw new CompilerError(`Virtual field must specify it's type`, input);
  }

  return {
    kind: "virtual-input",
    name: input.name,
    type: type.type,
    nullable: !!input.atoms.find((a) => a.kind === "nullable"),
    optional: !!input.atoms.find((a) => a.kind === "optional"),
    validators,
  };
}

function compileEndpoint(endpoint: EndpointAST): EndpointSpec {
  let actions: ActionSpec[] = [];
  let authorize: ExpSpec | undefined;
  let cardinality: EndpointCardinality | undefined;
  let method: EndpointMethod | undefined;
  let path: string | undefined;

  endpoint.body.map((b) => {
    if (b.kind === "action-block") {
      actions = b.atoms.map((action) => compileAnyAction(action, endpoint.type));
    } else if (b.kind === "authorize") {
      authorize = compileQueryExp(b.expression);
    } else if (b.kind === "cardinality") {
      cardinality = b.value;
    } else if (b.kind === "method") {
      method = b.value;
    } else if (b.kind === "path") {
      path = b.value;
    } else {
      assertUnreachable(b);
    }
  });

  return {
    type: endpoint.type,
    actions,
    authorize,
    method,
    path,
    cardinality,
    interval: endpoint.interval,
  };
}

function compileEntrypoint(entrypoint: EntrypointAST): EntrypointSpec {
  let target: EntrypointSpec["target"] | undefined;
  let identify: string | undefined;
  let response: EntrypointSpec["response"] | undefined;
  let authorize: ExpSpec | undefined;
  const endpoints: EndpointSpec[] = [];
  const entrypoints: EntrypointSpec[] = [];

  entrypoint.body.forEach((b) => {
    if (b.kind === "target") {
      target = b.target;
    } else if (b.kind === "identify") {
      identify = b.identifier;
    } else if (b.kind === "response") {
      response = b.select;
    } else if (b.kind === "endpoint") {
      endpoints.push(compileEndpoint(b.endpoint));
    } else if (b.kind === "entrypoint") {
      entrypoints.push(compileEntrypoint(b.entrypoint));
    } else if (b.kind === "authorize") {
      authorize = compileQueryExp(b.expression);
    } else {
      assertUnreachable(b);
    }
  });

  if (target === undefined) {
    throw new CompilerError("'entrypoint' has no 'target'", entrypoint);
  }

  return {
    name: entrypoint.name,
    target,
    identify,
    response,
    authorize,
    endpoints,
    entrypoints,
    interval: entrypoint.interval,
  };
}

function compileBaseHook(hook: HookAST): HookSpec {
  const name = hook.name;
  let code: HookCodeSpec | undefined;
  let runtimeName: string | undefined;

  hook.body.forEach((b) => {
    if (b.kind === "inline") {
      code = { kind: "inline", inline: b.inline };
    } else if (b.kind === "source") {
      code = { kind: "source", target: b.target, file: b.file };
    } else if (b.kind === "execution-runtime") {
      runtimeName = b.name;
    }
  });

  if (!code) {
    throw new CompilerError("'hook' needs to have 'source' or 'inline'", hook);
  }

  return {
    name,
    runtimeName,
    code,
    interval: hook.interval,
  };
}

function compileFieldValidatorHook(hook: HookAST): FieldValidatorHookSpec {
  let arg: string | undefined;
  const baseHook = compileBaseHook(hook);

  hook.body.forEach((b) => {
    if (b.kind === "arg") {
      if (arg !== undefined) {
        throw new CompilerError("'hook' inside field validation can only have one arg", b);
      }
      if (b.value.kind !== "default") {
        throw new CompilerError("'hook' inside field validation must have a 'default' 'arg'", b);
      }
      arg = b.name;
    }
  });

  return { ...baseHook, arg };
}

function compileModelHook(hook: HookAST): ModelHookSpec {
  const args: ModelHookSpec["args"] = [];

  const baseHook = compileBaseHook(hook);
  const name = baseHook.name;

  if (!name) {
    throw new CompilerError("'hook' inside model must be named", hook);
  }

  hook.body.forEach((b) => {
    if (b.kind === "arg") {
      if (b.value.kind !== "query") {
        throw new CompilerError("'hook' inside model must have 'arg' with 'query'", b);
      }
      // hook query has a generated name with pattern -> HOOK_NAME:ARG_NAME
      // placeholder name, not actually used FIXME
      const queryName = `${name}:${b.name}`;
      const query = compileQuery({ ...b.value, name: queryName }, []);
      args.push({ name: b.name, query });
    }
  });

  return { ...baseHook, name, args };
}

function compileActionHook(hook: HookAST): ActionHookSpec {
  const args: ActionHookSpec["args"] = {};

  const baseHook = compileBaseHook(hook);
  const name = baseHook.name;

  hook.body.forEach((b) => {
    if (b.kind === "arg") {
      if (b.value.kind === "expression") {
        args[b.name] = { kind: "expression", exp: compileQueryExp(b.value.exp) };
      } else if (b.value.kind === "query") {
        args[b.name] = { kind: "query", query: compileQuery({ ...b.value, name: b.name }) };
      } else {
        throw new CompilerError("Invalid `hook` type for this context", b);
      }
    }
  });

  return { ...baseHook, name, args };
}

function compilePopulator(populator: PopulatorAST): PopulatorSpec {
  const name = populator.name;
  const populates = populator.body.map(compilePopulate);

  return { name, populates };
}

function compilePopulate(populate: PopulateAST): PopulateSpec {
  const name = populate.name;
  let target: PopulateSpec["target"] | undefined;
  let identify: string | undefined;
  let repeater: RepeaterSpec | undefined;
  const setters: PopulateSetterSpec[] = [];
  const populates: PopulateSpec[] = [];

  populate.body.forEach((p) => {
    const kind = p.kind;
    if (kind === "target") {
      target = p.target;
    } else if (kind === "identify") {
      identify = p.identifier;
    } else if (kind === "repeat") {
      let fixed: number | undefined;
      let range: { start?: number; end?: number } | undefined;
      p.repeat.atoms.forEach((a) => {
        const kind = a.kind;
        if (kind === "fixed") {
          fixed = a.value;
        } else if (kind === "start") {
          range = range ?? {};
          range.start = a.value;
        } else if (kind === "end") {
          range = range ?? {};
          range.end = a.value;
        } else {
          assertUnreachable(kind);
        }
      });
      if (fixed != null && range != null) {
        throw new CompilerError(
          `Action repeat contains both fixed and range values: ${p.interval}`
        );
      }

      if (fixed != null) {
        repeater = {
          kind: "fixed",
          alias: p.repeat.alias,
          value: fixed,
        };
      } else if (range != null) {
        repeater = {
          kind: "range",
          alias: p.repeat.alias,
          range,
        };
      } else {
        throw new CompilerError(`Action repeat contains no values: ${p.interval}`);
      }
    } else if (kind === "set") {
      const set =
        p.set.kind === "hook"
          ? { kind: p.set.kind, hook: compileActionHook(p.set.hook) }
          : { kind: p.set.kind, exp: compileQueryExp(p.set.exp) };

      setters.push({ ...p, set });
    } else if (kind === "populate") {
      populates.push(compilePopulate(p.populate));
    } else {
      assertUnreachable(kind);
    }
  });

  if (target === undefined) {
    throw new CompilerError("'populate' has no 'target'", populate);
  }

  return {
    name,
    target,
    identify,
    repeater,
    setters,
    populates,
  };
}

function compileExecutionRuntime(runtime: ExecutionRuntimeAST): ExecutionRuntimeSpec {
  const name = runtime.name;
  let sourcePath: string | undefined;
  let isDefault: boolean | undefined;

  runtime.body.forEach((atom) => {
    const kind = atom.kind;
    if (kind === "sourcePath") {
      sourcePath = atom.value;
    } else if (kind === "default") {
      isDefault = true;
    } else {
      assertUnreachable(kind);
    }
  });

  ensureExists(name, "Runtime name cannot be empty");
  ensureExists(sourcePath, "Runtime source path cannot be empty");

  return { name, default: isDefault, sourcePath };
}

// ----- authenticator

function compileAuthenticator(authenticator: AuthenticatorAST): AuthenticatorSpec {
  const name = authenticator.name;
  // this is not exposed in blueprint yet
  const authUserModelName = AUTH_TARGET_MODEL_NAME;
  const accessTokenModelName = `${authUserModelName}AccessToken`;
  const method = compileAuthenticatorMethod(authenticator.body);

  if (method == null) {
    throw new CompilerError("Authenticator method is required.");
  }

  return { name, authUserModelName, accessTokenModelName, method };
}

function compileAuthenticatorMethod(
  atoms: AuthenticatorBodyAtomAST[]
): AuthenticatorMethodSpec | undefined {
  const methodAtom = atoms.filter((a): a is AuthenticatorMethodBodyAtomAST => a.kind === "method");
  if (methodAtom.length == 0) {
    return;
  }
  if (methodAtom.length > 1) {
    throw new CompilerError(`Max 1 authenticator method is allowed but ${methodAtom.length} given`);
  }

  const method = methodAtom[0];
  const methodKind = method.methodKind;
  if (methodKind === "basic") {
    // add here basic method's config properties
    return { kind: "basic" };
  } else {
    assertUnreachable(methodKind);
  }
}

function compileGenerator(generator: GeneratorAST): GeneratorSpec {
  const type = generator.type;

  if (type === "client") {
    let target: string | undefined, api: string | undefined, output: string | undefined;
    generator.body.forEach((atom) => {
      const kind = atom.kind;
      switch (kind) {
        case "target":
          target = atom.value;

          break;
        case "api":
          api = atom.value;
          break;
        case "output":
          output = atom.value;
          break;
        default:
          assertUnreachable(kind);
      }
    });
    ensureExists(target);
    ensureExists(api);

    return { kind: "generator-client", target, api, output };
  } else {
    throw new CompilerError(`Unsupported generator type ${type}`);
  }
}

export function compile(input: AST): Specification {
  const models: ModelSpec[] = [];
  const entrypoints: EntrypointSpec[] = [];
  const populators: PopulatorSpec[] = [];
  const runtimes: ExecutionRuntimeSpec[] = [];
  let authenticator: AuthenticatorSpec | undefined = undefined;
  const generators: GeneratorSpec[] = [];

  input.map((definition) => {
    const kind = definition.kind;
    if (kind === "model") {
      models.push(compileModel(definition));
    } else if (kind === "entrypoint") {
      entrypoints.push(compileEntrypoint(definition));
    } else if (kind === "populator") {
      populators.push(compilePopulator(definition));
    } else if (kind === "execution-runtime") {
      runtimes.push(compileExecutionRuntime(definition));
    } else if (kind === "authenticator") {
      authenticator = compileAuthenticator(definition);
    } else if (kind === "generator") {
      generators.push(compileGenerator(definition));
    } else {
      assertUnreachable(kind);
    }
  });

  return { models, entrypoints, populators, runtimes, authenticator, generators };
}
