import _ from "lodash";
import { match } from "ts-pattern";

import * as AST from "./ast/ast";
import { Type, getTypeCardinality, getTypeModel } from "./ast/type";
import { accessTokenModelName, authUserModelName } from "./plugins/authenticator";

import { kindFilter, kindFind } from "@src/common/kindFilter";
import { ensureEqual, ensureExists } from "@src/common/utils";
import { HookCode } from "@src/types/common";
import * as Spec from "@src/types/specification";

export function migrate(projectASTs: AST.ProjectASTs): Spec.Specification {
  const globals = _.concat(...Object.values(projectASTs.plugins), projectASTs.document);
  const globalModels = kindFilter(globals, "model");

  const authenticatorAst = kindFind(globals, "authenticator");
  const authenticator = authenticatorAst && migrateAuthenticator(authenticatorAst);

  function migrateModel(model: AST.Model): Spec.Model {
    const fields = migrateFields(model);
    const references = kindFilter(model.atoms, "reference").map(migrateReference);
    const relations = kindFilter(model.atoms, "relation").map(migrateRelation);
    const queries = kindFilter(model.atoms, "query").map(migrateModelQuery);
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

  function migrateImplicitRelations(models: Spec.Model[]) {
    if (!authenticator) return;

    const implicitModelNames = [
      authenticator.authUserModelName,
      authenticator.accessTokenModelName,
    ];
    const implicitModels = models.filter((m) => implicitModelNames.includes(m.name));

    models.forEach((model) => {
      if (implicitModelNames.includes(model.name)) return;
      model.references.forEach((reference) => {
        implicitModels.forEach((implicitModel) => {
          if (reference.to.model === implicitModel.name) {
            const relationName = `${_.camelCase(reference.ref.parentModel)}${_.upperFirst(
              _.camelCase(reference.name)
            )}Rel`;
            const relation: Spec.Relation = {
              name: relationName,
              ref: {
                kind: "modelAtom",
                atomKind: "relation",
                parentModel: implicitModel.name,
                name: relationName,
                model: reference.ref.parentModel,
                through: reference.ref.name,
              },
              through: reference.ref,
              unique: reference.unique,
            };
            implicitModel.relations.push(relation);
          }
        });
      });
    });
  }

  function migrateFields(model: AST.Model): Spec.Field[] {
    const idField: Spec.Field = {
      ref: generateModelIdIdentifier(model.name.text).ref,
      primary: true,
      validators: [],
    };
    const fields = kindFilter(model.atoms, "field").map(migrateField);

    const references = kindFilter(model.atoms, "reference").map((reference): Spec.Field => {
      ensureExists(reference.name.ref);
      return {
        ref: referenceToIdRef(reference.name.ref),
        primary: false,
        validators: [],
      };
    });

    return [idField, ...fields, ...references];
  }

  function migrateField(field: AST.Field): Spec.Field {
    const default_ = kindFind(field.atoms, "default");
    const validators = kindFilter(field.atoms, "validate").flatMap((v) =>
      v.validators.map(migrateValidator)
    );
    ensureExists(field.name.ref);

    return {
      ref: field.name.ref,
      default: default_ && migrateLiteral(default_.literal),
      primary: false,
      validators: validators,
    };
  }

  function migrateValidator(validator: AST.Validator): Spec.Validator {
    if (validator.kind === "builtin") {
      return {
        kind: "builtin",
        name: validator.name.text,
        args: validator.args.map(migrateLiteral),
      };
    } else {
      return { kind: "hook", hook: migrateFieldValidationHook(validator) };
    }
  }

  function migrateReference(reference: AST.Reference): Spec.Reference {
    const to = kindFind(reference.atoms, "to");
    const unique = kindFind(reference.atoms, "unique");
    const nullable = kindFind(reference.atoms, "nullable");
    ensureExists(reference.name.ref);
    ensureExists(to?.identifier.ref);

    return {
      name: reference.name.text,
      ref: reference.name.ref,
      to: to.identifier.ref,
      unique: !!unique,
      nullable: !!nullable,
    };
  }

  function migrateRelation(relation: AST.Relation): Spec.Relation {
    const through = kindFind(relation.atoms, "through");
    ensureExists(through?.identifier.ref);
    ensureExists(relation.name.ref);

    return {
      name: relation.name.text,
      ref: relation.name.ref,
      through: through.identifier.ref,
      unique: through.identifier.ref.unique,
    };
  }

  function migrateModelQuery(query: AST.Query) {
    ensureExists(query.name.ref);
    const model = query.name.ref.parentModel;
    const initialPath: Spec.IdentifierRef[] = [
      { text: model, ref: { kind: "model", model }, type: Type.model(model) },
    ];
    return migrateQuery(initialPath, query.name.text, query.name.type, query.atoms);
  }

  function migrateAnonymousQuery(query: AST.AnonymousQuery, model?: string) {
    let initialPath: Spec.IdentifierRef[] = [];
    const from = kindFind(query.atoms, "from");
    if (!from) {
      ensureExists(model);
      initialPath = [{ text: model, ref: { kind: "model", model }, type: Type.model(model) }];
    }
    return migrateQuery(initialPath, "$query", query.type, query.atoms);
  }

  function migrateQuery(
    initialPath: Spec.IdentifierRef[],
    name: string,
    type: Type,
    atoms: AST.QueryAtom[]
  ): Spec.Query {
    const from = kindFind(atoms, "from");
    const filter = kindFind(atoms, "filter");
    const orderBy = kindFind(atoms, "orderBy")?.orderBy.map((a) => ({
      expr: migrateExpr(a.expr),
      order: a.order,
    }));
    const limit = kindFind(atoms, "limit");
    const offset = kindFind(atoms, "offset");
    const select = kindFind(atoms, "select");
    const aggregate = kindFind(atoms, "aggregate");

    const fromModel = [
      ...initialPath,
      ...(from?.identifierPath.map((i) => migrateIdentifierRef(i)) ?? []),
    ];

    const sourceModel = getTypeModel(fromModel[0].type)!;
    const targetModel = getTypeModel(fromModel.at(-1)!.type)!;

    return {
      name,
      sourceModel,
      targetModel,
      cardinality: getTypeCardinality(type),
      from: [...initialPath, ...(from?.identifierPath.map((i) => migrateIdentifierRef(i)) ?? [])],
      fromAlias: from?.as?.identifierPath.map((i) => migrateIdentifierRef(i)),
      filter: filter ? migrateExpr(filter.expr) : undefined,
      orderBy,
      limit: limit?.value.value,
      offset: offset?.value.value,
      select: select ? migrateSelect(select.select) : createAutoselect(targetModel),
      aggregate: aggregate?.aggregate,
    };
  }

  function migrateComputed(computed: AST.Computed): Spec.Computed {
    ensureExists(computed.name.ref);
    return {
      name: computed.name.text,
      ref: computed.name.ref,
      expr: migrateExpr(computed.expr),
    };
  }

  function migrateApi(api: AST.Api): Spec.Api {
    return {
      name: api.name?.text,
      entrypoints: api.atoms.map((entrypoint) =>
        migrateEntrypoint(entrypoint, undefined, undefined, 0)
      ),
    };
  }

  function migrateEntrypoint(
    entrypoint: AST.Entrypoint,
    parentAlias: Spec.IdentifierRef<AST.RefTarget> | undefined,
    parentAuthorize: Spec.Expr | undefined,
    depth: number
  ): Spec.Entrypoint {
    const target = migrateIdentifierRef(entrypoint.target);
    const model = target.ref.model;
    const cardinality = getTypeCardinality(target.type);

    let identifyThrough: Spec.IdentifierRef<AST.RefModelField> | undefined;
    if (cardinality === "collection") {
      const identify = kindFind(entrypoint.atoms, "identify");
      const identifyThroughAst = identify && kindFind(identify.atoms, "through")?.identifier;
      identifyThrough = identifyThroughAst
        ? migrateIdentifierRef(identifyThroughAst)
        : generateModelIdIdentifier(model);
    }

    const alias: Spec.IdentifierRef<AST.RefTarget> = entrypoint.as
      ? migrateIdentifierRef(entrypoint.as.identifier)
      : {
          text: `$target_${depth}`,
          ref: { kind: "target", targetKind: "entrypoint" },
          type: Type.model(model),
        };

    const astAuthorize = kindFind(entrypoint.atoms, "authorize")?.expr;
    const authorize = combineExprWithAnd(
      parentAuthorize,
      astAuthorize && migrateExpr(astAuthorize)
    );
    const responseAst = kindFind(entrypoint.atoms, "response")?.select;
    const response = responseAst ? migrateSelect(responseAst) : createAutoselect(model);
    const endpoints = kindFilter(entrypoint.atoms, "endpoint").map((endpoint) =>
      migrateEndpoint(endpoint, target, alias, parentAlias, authorize, response)
    );

    const entrypoints = kindFilter(entrypoint.atoms, "entrypoint").map((entrypoint) =>
      migrateEntrypoint(entrypoint, alias, authorize, depth + 1)
    );

    return {
      // TODO: use name from param, alias and target?
      name: "",
      model,
      cardinality,
      alias,
      target,
      identifyThrough,
      endpoints,
      entrypoints,
    };
  }

  function migrateEndpoint(
    endpoint: AST.Endpoint,
    target: Spec.IdentifierRef,
    alias: Spec.IdentifierRef,
    parentAlias: Spec.IdentifierRef | undefined,
    parentAuthorize: Spec.Expr | undefined,
    response: Spec.Select
  ): Spec.Endpoint {
    const actions = (
      kindFind(endpoint.atoms, "action")?.actions ?? generatePrimaryAction(endpoint)
    ).flatMap((a, i) => migrateAction(a, i, target, alias, parentAlias));

    const astAuthorize = kindFind(endpoint.atoms, "authorize")?.expr;
    const authorize = combineExprWithAnd(
      parentAuthorize,
      astAuthorize && migrateExpr(astAuthorize)
    );

    switch (endpoint.type) {
      case "list": {
        const pageable = !!kindFind(endpoint.atoms, "pageable");
        const orderBy = kindFind(endpoint.atoms, "orderBy")?.orderBy.map((a) => ({
          expr: migrateExpr(a.expr),
          order: a.order,
        }));
        const filterAst = kindFind(endpoint.atoms, "filter")?.expr;
        const filter = filterAst && migrateExpr(filterAst);

        return { kind: "list", actions, authorize, response, pageable, orderBy, filter };
      }
      case "get": {
        return { kind: "get", actions, authorize, response };
      }
      case "create":
      case "update": {
        return { kind: endpoint.type, actions, authorize, response };
      }
      case "delete": {
        return { kind: "delete", actions, authorize };
      }
      case "custom": {
        const method = kindFind(endpoint.atoms, "method")!.method;
        const cardinality = kindFind(endpoint.atoms, "cardinality")!.cardinality;
        const path = kindFind(endpoint.atoms, "path")!.path.value;

        return { kind: "custom", actions, authorize, method, cardinality, path };
      }
    }
  }

  function generatePrimaryAction(endpoint: AST.Endpoint): AST.Action[] {
    const zeroToken = { start: 0, end: 0, filename: ":gaudi:" };
    switch (endpoint.type) {
      case "create":
      case "update": {
        return [
          {
            kind: endpoint.type,
            keyword: zeroToken,
            atoms: [],
            isPrimary: true,
          },
        ];
      }
      case "delete":
        return [{ kind: "delete", keyword: zeroToken, isPrimary: true }];
      default:
        return [];
    }
  }

  function combineExprWithAnd(
    a: Spec.Expr | undefined,
    b: Spec.Expr | undefined
  ): Spec.Expr | undefined {
    if (!a) return b;
    if (!b) return a;
    return {
      kind: "function",
      name: "and",
      type: Type.boolean,
      args: [a, b],
    };
  }

  function migrateAction(
    action: AST.Action,
    index: number,
    target: Spec.IdentifierRef,
    alias: Spec.IdentifierRef,
    parentAlias: Spec.IdentifierRef | undefined
  ): Spec.Action[] {
    return match(action)
      .with({ kind: "create" }, { kind: "update" }, (a) =>
        migrateModelAction(a, index, target, alias, parentAlias)
      )
      .with({ kind: "delete" }, (a) => [migrateDeleteAction(a, alias)])
      .with({ kind: "execute" }, (a) => [migrateExecuteAction(a, index)])
      .with({ kind: "fetch" }, (a) => [migrateFetchAction(a)])
      .exhaustive();
  }

  function migrateModelAction(
    action: AST.ModelAction,
    index: number,
    target: Spec.IdentifierRef,
    alias: Spec.IdentifierRef,
    parentAlias: Spec.IdentifierRef | undefined
  ): Spec.ModelAction[] {
    const primaryActionTarget = action.kind === "create" ? target : alias;
    const targetPath: Spec.IdentifierRef[] = action.target?.map((i) => migrateIdentifierRef(i)) ?? [
      primaryActionTarget,
    ];
    const last = targetPath.at(-1)!;
    const contextRelation =
      last.ref.kind === "modelAtom" && last.ref.atomKind === "relation" ? last.ref : undefined;
    const model = globalModels.find((m) => m.name.text === getTypeModel(last.type)!)!;

    const inputs = kindFilter(action.atoms, "input").flatMap(migrateActionAtomInput);
    const denyAtoms = kindFilter(action.atoms, "deny");
    const allDenied = !!denyAtoms.find(({ fields }) => fields.kind === "all");
    const deniedFields = denyAtoms.flatMap(({ fields }) =>
      fields.kind === "list" ? fields.fields.map((i) => migrateIdentifierRef(i)) : []
    );
    const sets = kindFilter(action.atoms, "set").map(migrateActionAtomSet);
    const refThroughs = kindFilter(action.atoms, "referenceThrough").map(
      (referenceThrough): Spec.ActionAtomRefThrough => {
        ensureExists(referenceThrough.target.ref);
        ensureExists(referenceThrough.through.ref);
        return {
          kind: "reference",
          target: referenceThrough.target.ref,
          through: referenceThrough.through.ref,
        };
      }
    );

    const actionAtoms = migrateFields(model).flatMap((field): Spec.ModelActionAtom[] => {
      // id field can't be set or updated
      if (field.ref.name === "id") return [];

      // reference id that is set by context
      if (contextRelation && field.ref.name === contextRelation.through + "_id") {
        let parentPath = targetPath.slice(0, -1);
        if (parentPath.length === 0 && parentAlias) {
          parentPath = [parentAlias];
        }
        return [
          {
            kind: "set",
            target: field.ref,
            set: {
              kind: "expression",
              expr: {
                kind: "identifier",
                identifier: [...parentPath, generateModelIdIdentifier(contextRelation.parentModel)],
                type: Type.integer,
              },
            },
          },
        ];
      }

      const set = sets.find((s) => s.target.name === field.ref.name);
      if (set) return [set];
      const refThrough = refThroughs.find((r) => r.target.name + "_id" === field.ref.name);
      if (refThrough) return [refThrough];
      const input = inputs.find((i) => i.target.name === field.ref.name);
      if (input) return [input];
      if (allDenied) return [];
      const denied = deniedFields.find((i) => i.text === field.ref.name);
      if (denied) return [];

      return [
        {
          kind: "input",
          target: field.ref,
          optional: field.ref.nullable || action.kind === "update",
          default: field.ref.nullable
            ? { kind: "literal", literal: { kind: "null", value: null } }
            : undefined,
        },
      ];
    });

    const virtualInputs = kindFilter(action.atoms, "virtualInput").map(
      migrateActionAtomVirtualInput
    );

    const actions: Spec.ModelAction[] = [
      {
        kind: action.kind,
        targetPath,
        alias: action.as?.identifier.text ?? `$action_${index}`,
        actionAtoms: [...virtualInputs, ...actionAtoms],
        isPrimary: !!action.isPrimary,
      },
    ];

    // update related reference id when creating a reference
    if (
      action.kind === "create" &&
      last.ref.kind === "modelAtom" &&
      last.ref.atomKind === "reference"
    ) {
      let parentPath = targetPath.slice(0, -1);
      if (parentPath.length === 0 && parentAlias) {
        parentPath = [parentAlias];
      }
      actions.push({
        kind: "update",
        targetPath: parentPath,
        alias: `$action_${index}_reference`,
        actionAtoms: [
          {
            kind: "set",
            target: referenceToIdRef(last.ref),
            set: {
              kind: "expression",
              expr: {
                kind: "identifier",
                identifier: [...parentPath, generateModelIdIdentifier(last.ref.parentModel)],
                type: Type.integer,
              },
            },
          },
        ],
        isPrimary: false,
      });
    }

    return actions;
  }

  function migrateDeleteAction(
    action: AST.DeleteAction,
    primaryTarget: Spec.IdentifierRef
  ): Spec.Action {
    return {
      kind: "delete",
      targetPath: action.target?.map((i) => migrateIdentifierRef(i)) ?? [primaryTarget],
    };
  }

  function migrateExecuteAction(action: AST.ExecuteAction, index: number): Spec.Action {
    const atoms = kindFilter(action.atoms, "virtualInput").map(migrateActionAtomVirtualInput);

    return {
      kind: "execute",
      alias: action.name?.text ?? `$action_${index}`,
      hook: migrateActionHook(kindFind(action.atoms, "hook")!),
      responds: !!kindFind(action.atoms, "responds"),
      atoms,
    };
  }

  function migrateFetchAction(action: AST.FetchAction): Spec.Action {
    const atoms = kindFilter(action.atoms, "virtualInput").map(migrateActionAtomVirtualInput);

    return {
      kind: "fetch",
      alias: action.name.text,
      query: migrateAnonymousQuery(kindFind(action.atoms, "anonymousQuery")!),
      atoms,
    };
  }

  function migrateActionAtomSet(set: AST.ActionAtomSet): Spec.ActionAtomSet {
    const target = migrateIdentifierRef(set.target);

    // simplify all reference sets to _id sets
    if (target.ref.atomKind === "reference") {
      ensureEqual(set.set.kind, "expr");
      const expr = migrateExpr(set.set.expr);
      if (expr.kind === "literal") {
        ensureEqual(expr.literal.kind, "null");
      } else {
        ensureEqual(expr.kind, "identifier");
        const model = getTypeModel(expr.identifier.at(-1)!.type)!;
        ensureExists(model);
        expr.identifier.push(generateModelIdIdentifier(model));
      }

      return {
        kind: "set",
        target: referenceToIdRef(target.ref),
        set: { kind: "expression", expr },
      };
    }

    return {
      kind: "set",
      // Typescript bug? just 'target' should be allowed
      target: target.ref,
      set:
        set.set.kind === "expr"
          ? { kind: "expression", expr: migrateExpr(set.set.expr) }
          : { kind: "hook", hook: migrateActionHook(set.set) },
    };
  }

  function migrateActionAtomInput({ fields }: AST.ActionAtomInput): Spec.ActionAtomInput[] {
    return fields.map(({ field, atoms }): Spec.ActionAtomInput => {
      const optional = !!kindFind(atoms, "optional");
      const default_ = kindFind(atoms, "default")?.value;
      let migratedDefault: Spec.ActionAtomInput["default"];
      if (default_) {
        if (default_.kind === "literal") {
          migratedDefault = { kind: "literal", literal: migrateLiteral(default_.literal) };
        } else if (default_.kind === "path") {
          migratedDefault = {
            kind: "reference",
            reference: default_.path.map((i) => migrateIdentifierRef(i)),
          };
        } else {
          throw Error("Default input as expression is not supported in spec");
        }
      }

      const migratedField = migrateIdentifierRef(field);
      const target =
        migratedField.ref.atomKind === "reference"
          ? referenceToIdRef(migratedField.ref)
          : migratedField.ref;

      return {
        kind: "input",
        target,
        optional,
        default: migratedDefault,
      };
    });
  }

  function migrateActionAtomVirtualInput({
    name,
    atoms,
  }: AST.ActionAtomVirtualInput): Spec.ActionAtomVirtualInput {
    const validators = kindFilter(atoms, "validate").flatMap((v) =>
      v.validators.map(migrateValidator)
    );
    const { ref } = migrateIdentifierRef(name);
    return {
      kind: "virtual-input",
      name: name.text,
      type: ref.type,
      nullable: !!kindFind(atoms, "nullable"),
      optional: false,
      validators,
    };
  }

  function migratePopulator(populator: AST.Populator): Spec.Populator {
    return {
      name: populator.name.text,
      populates: populator.atoms.map((p) => migratePopulate(p, undefined, 0)),
    };
  }

  function migratePopulate(
    populate: AST.Populate,
    parentAlias: Spec.IdentifierRef<AST.RefTarget> | undefined,
    depth: number
  ): Spec.Populate {
    const target = migrateIdentifierRef(populate.target);

    const alias: Spec.IdentifierRef<AST.RefTarget> = populate.as?.identifier
      ? migrateIdentifierRef(populate.as.identifier)
      : {
          text: `$target_${depth}`,
          ref: { kind: "target", targetKind: "populate" },
          type: target.type,
        };

    let setters = kindFilter(populate.atoms, "set").map(migrateActionAtomSet);
    if (target.ref.kind === "modelAtom" && target.ref.atomKind === "relation" && parentAlias) {
      const referenceName = `${target.ref.through}_id`;
      const contextIdSet: Spec.ActionAtomSet = {
        kind: "set",
        target: {
          kind: "modelAtom",
          atomKind: "field",
          parentModel: target.ref.model,
          name: referenceName,
          type: "integer",
          // TODO: this is not technically true
          nullable: false,
          unique: false,
        },
        set: {
          kind: "expression",
          expr: {
            kind: "identifier",
            identifier: [parentAlias, generateModelIdIdentifier(target.ref.parentModel)],
            type: Type.integer,
          },
        },
      };
      setters = [contextIdSet, ...setters];
    }

    const populates = kindFilter(populate.atoms, "populate").map((p) =>
      migratePopulate(p, alias, depth + 1)
    );

    const repeat = kindFind(populate.atoms, "repeat");
    const repeatValue = repeat?.repeatValue;
    const repeatAlias = repeat?.as?.identifier.text;

    return {
      target,
      cardinality: getTypeCardinality(target.type),
      alias,
      setters,
      populates,
      repeater: repeatValue ? migrateRepeatValue(repeatValue, repeatAlias) : undefined,
    };
  }

  function migrateRepeatValue(repeatValue: AST.RepeatValue, alias?: string): Spec.Repeater {
    switch (repeatValue.kind) {
      case "short":
        return { kind: "fixed", value: repeatValue.value.value, alias };
      case "long": {
        const start = kindFind(repeatValue.atoms, "start")?.value.value;
        const end = kindFind(repeatValue.atoms, "end")?.value.value;
        return { kind: "range", range: { start, end }, alias };
      }
    }
  }

  function migrateRuntime(runtime: AST.Runtime): Spec.ExecutionRuntime {
    return {
      name: runtime.name.text,
      sourcePath: kindFind(runtime.atoms, "sourcePath")!.path.value,
    };
  }

  function migrateAuthenticator(_authenticator: AST.Authenticator): Spec.Authenticator {
    return { authUserModelName, accessTokenModelName, method: { kind: "basic" } };
  }

  function migrateGenerator(generator: AST.Generator): Spec.Generator {
    return match(generator)
      .with({ type: "client" }, (g) => {
        const target = kindFind(g.atoms, "target")!.value;
        const output = kindFind(g.atoms, "output")?.value.value;

        return {
          kind: "generator-client" as const,
          target,
          output,
        };
      })
      .exhaustive();
  }

  function migrateModelHook(hook: AST.ModelHook): Spec.ModelHook {
    const code = getHookCode(hook);
    ensureExists(hook.name.ref);
    const ref = hook.name.ref;
    // model spec does not support expression hooks
    const _args = kindFilter(hook.atoms, "arg_expr").map((a) => ({ name: a.name.text }));
    const args = kindFilter(hook.atoms, "arg_query").map((a) => {
      return {
        name: a.name.text,
        query: migrateAnonymousQuery(a.query, ref.parentModel),
      };
    });
    return { name: hook.name.text, ref, code, args };
  }

  function migrateFieldValidationHook(hook: AST.FieldValidationHook): Spec.FieldValidatorHook {
    const code = getHookCode(hook);
    const arg = kindFind(hook.atoms, "default_arg");
    return { code, arg: arg?.name.text };
  }

  function migrateActionHook(hook: AST.ActionHook): Spec.ActionHook {
    const code = getHookCode(hook);
    const exprArgs = kindFilter(hook.atoms, "arg_expr").map(
      (a): Spec.ActionHook["args"][number] => ({
        kind: "expression",
        name: a.name.text,
        expr: migrateExpr(a.expr),
      })
    );
    const queryArgs = kindFilter(hook.atoms, "arg_query").map(
      (a): Spec.ActionHook["args"][number] => ({
        kind: "query",
        name: a.name.text,
        query: migrateAnonymousQuery(a.query),
      })
    );
    return { code, args: [...exprArgs, ...queryArgs] };
  }

  function getHookCode(hook: AST.Hook<"model" | "validation" | "action">): HookCode {
    const inline = kindFind(hook.atoms, "inline");
    if (inline) {
      return { kind: "inline", inline: inline.code.value };
    }
    const source = kindFind(hook.atoms, "source")!;
    return {
      kind: "source",
      target: source.name.text,
      file: source.file.value,
      runtimeName: source.runtime!,
    };
  }

  function migrateSelect(select: AST.Select): Spec.Select {
    return select.map((s): Spec.SingleSelect => {
      let expr: Spec.Expr;
      if (s.target.kind === "long") {
        expr = migrateExpr(s.target.expr);
      } else {
        const identifier = migrateIdentifierRef(s.target.name);
        expr = { kind: "identifier", identifier: [identifier], type: identifier.type };
      }
      const model = getTypeModel(expr.type);
      if (model) {
        const select = s.select ? migrateSelect(s.select) : createAutoselect(model);
        return { kind: "nested", name: s.target.name.text, expr, select };
      } else {
        return { kind: "final", name: s.target.name.text, expr };
      }
    });
  }

  function createAutoselect(modelName: string): Spec.Select {
    const model = globalModels.find((m) => m.name.text === modelName)!;
    return migrateFields(model).map((field) => {
      const type = field.ref.nullable
        ? Type.nullable(Type.primitive(field.ref.type))
        : Type.primitive(field.ref.type);
      return {
        kind: "final",
        name: field.ref.name,
        expr: {
          kind: "identifier",
          identifier: [{ text: field.ref.name, ref: field.ref, type }],
          type,
        },
      };
    });
  }

  function migrateExpr(expr: AST.Expr): Spec.Expr {
    switch (expr.kind) {
      case "binary": {
        // this is a quick fix to convert "+" to "concat" when strings are involved
        let name;
        if (
          expr.lhs.type.kind === "primitive" &&
          expr.lhs.type.primitiveKind === "string" &&
          expr.operator === "+"
        ) {
          name = "concat";
        } else {
          name = expr.operator;
        }

        return {
          kind: "function",
          name,
          args: [migrateExpr(expr.lhs), migrateExpr(expr.rhs)],
          type: expr.type,
        };
      }
      case "group":
        return migrateExpr(expr.expr);
      case "array":
        return { kind: "array", elements: expr.elements.map(migrateExpr), type: expr.type };
      case "unary":
        // converts 'not' to 'is not'
        return {
          kind: "function",
          name: "is not",
          args: [
            migrateExpr(expr.expr),
            { kind: "literal", literal: { kind: "boolean", value: true }, type: Type.boolean },
          ],
          type: expr.type,
        };
      case "path":
        return {
          kind: "identifier",
          identifier: expr.path.map((i) => migrateIdentifierRef(i)),
          type: expr.type,
        };
      case "literal":
        return { kind: "literal", literal: migrateLiteral(expr.literal), type: expr.type };
      case "function":
        return {
          kind: "function",
          name: expr.name.text,
          args: expr.args.map(migrateExpr),
          type: expr.type,
        };
    }
  }

  function referenceToIdRef(reference: AST.RefModelReference): AST.RefModelField {
    return {
      kind: "modelAtom",
      atomKind: "field",
      parentModel: reference.parentModel,
      name: `${reference.name}_id`,
      type: "integer",
      nullable: reference.nullable,
      unique: reference.unique,
    };
  }

  function generateModelIdIdentifier(model: string): Spec.IdentifierRef<AST.RefModelField> {
    return {
      text: "id",
      ref: {
        kind: "modelAtom",
        atomKind: "field",
        name: "id",
        type: "integer",
        nullable: false,
        parentModel: model,
        unique: true,
      },
      type: Type.integer,
    };
  }

  function migrateIdentifierRef<r extends AST.Ref>(
    identifier: AST.IdentifierRef<r>
  ): Spec.IdentifierRef<r> {
    ensureExists(identifier.ref);
    return {
      text: identifier.text,
      ref: identifier.ref,
      type: identifier.type,
    };
  }

  function migrateLiteral(ast: AST.Literal): Spec.Literal {
    const { token: _token, ...spec } = ast;
    return spec;
  }

  const models = globalModels.map(migrateModel);
  migrateImplicitRelations(models);

  return {
    models,
    apis: kindFilter(globals, "api").flatMap(migrateApi),
    populators: kindFilter(globals, "populator").map(migratePopulator),
    runtimes: kindFilter(globals, "runtime").map(migrateRuntime),
    authenticator,
    generators: kindFilter(globals, "generator").map(migrateGenerator),
  };
}
