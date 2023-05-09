import _ from "lodash";
import { match } from "ts-pattern";

import { kindFilter, kindFind } from "@src/common/kindFilter";
import { ensureEqual } from "@src/common/utils";
import * as AST from "@src/compiler/ast/ast";
import { composeHook } from "@src/composer/hooks2";
import { composeAggregate, composeExpression, composeQuery } from "@src/composer/query2";
import {
  AggregateDef,
  ComputedDef,
  ConstantDef,
  Definition,
  FieldDef,
  FieldType,
  IValidatorDef,
  ModelDef,
  ModelHookDef,
  QueryDef,
  ReferenceDef,
  RelationDef,
  ValidatorDef,
  ValidatorDefinition,
} from "@src/types/definition";
import { AUTH_TARGET_MODEL_NAME } from "@src/types/specification";

export function composeModels(def: Definition, projectASTs: AST.ProjectASTs): void {
  const globalAtoms = _.concat(...Object.values(projectASTs.plugins), projectASTs.document);
  const models = kindFilter(globalAtoms, "model");
  models.forEach((model) => {
    const mdef = defineModel(def, model);
    kindFilter(model.atoms, "field").forEach((field) => defineField(mdef, field));
    kindFilter(model.atoms, "computed").forEach((computed) => defineComputed(mdef, computed));
    kindFilter(model.atoms, "reference").forEach((reference) => defineReference(mdef, reference));
    kindFilter(model.atoms, "relation").forEach((relation) => defineRelation(mdef, relation));
    kindFilter(model.atoms, "query").forEach((query) => {
      if (kindFind(query.atoms, "aggregate")) {
        defineAggregate(models, mdef, query);
      } else {
        defineQuery(models, mdef, query);
      }
    });
    kindFilter(model.atoms, "hook").forEach((hook) => defineModelHook(models, mdef, hook));
  });

  defineImplicitRelation(projectASTs, def);
}

function defineModel(def: Definition, model: AST.Model): ModelDef {
  const mdef: ModelDef = {
    kind: "model",
    refKey: model.name.text,
    name: model.name.text,
    dbname: model.name.text.toLowerCase(),
    fields: [],
    references: [],
    relations: [],
    queries: [],
    aggregates: [],
    computeds: [],
    hooks: [],
  };
  const idField = constructIdField(mdef);
  mdef.fields.push(idField);
  def.models.push(mdef);

  return mdef;
}

function constructIdField(mdef: ModelDef): FieldDef {
  return {
    kind: "field",
    refKey: `${mdef.refKey}.id`,
    modelRefKey: mdef.refKey,
    name: "id",
    dbname: "id",
    type: "integer",
    dbtype: "serial",
    primary: true,
    unique: true,
    nullable: false,
    validators: [],
  };
}

function defineField(mdef: ModelDef, field: AST.Field): FieldDef {
  ensureEqual(field.ref.kind, "modelAtom");
  const typeString = kindFind(field.atoms, "type")?.identifier.text;
  const type = match<string | undefined, FieldType>(typeString)
    .with("integer", "float", () => "integer")
    .with("string", () => "text")
    .with("boolean", () => "boolean")
    .otherwise(() => {
      throw Error("Unexpected field type");
    });
  const refKey = `${field.ref.model}.${field.ref.name}`;

  const f: FieldDef = {
    kind: "field",
    refKey,
    modelRefKey: field.ref.model,
    name: field.ref.name,
    dbname: field.ref.name.toLowerCase(),
    type,
    dbtype: constructDbType(type),
    primary: false,
    unique: !!kindFind(field.atoms, "unique"),
    nullable: !!kindFind(field.atoms, "nullable"),
    validators: composeValidators(type, kindFind(field.atoms, "validate")?.validators ?? []),
  };
  mdef.fields.push(f);
  return f;
}

function defineComputed(mdef: ModelDef, computed: AST.Computed): ComputedDef {
  ensureEqual(computed.ref.kind, "modelAtom");
  const refKey = `${computed.ref.model}.${computed.ref.name}`;

  let primitiveType;
  let nullable = false;
  switch (computed.type.kind) {
    case "model":
    case "collection":
    case "struct":
    case "unknown":
      // this is unexpected
      primitiveType = "unknown" as const;
      break;
    case "nullable":
      primitiveType =
        computed.type.type.kind === "primitive"
          ? computed.type.type.primitiveKind
          : ("unknown" as const);
      nullable = true;
      break;
    case "primitive":
      primitiveType = computed.type.primitiveKind;
  }
  if (primitiveType === "float") primitiveType = "integer" as const;
  if (primitiveType === "string") primitiveType = "text" as const;

  const c: ComputedDef = {
    kind: "computed",
    refKey,
    modelRefKey: computed.ref.model,
    name: computed.ref.name,
    exp: composeExpression(computed.expr, [computed.ref.model]),
    type: { kind: primitiveType, nullable },
  };
  mdef.computeds.push(c);
  return c;
}

export function composeValidators(
  fieldType: FieldDef["type"],
  validators: AST.Validator[]
): ValidatorDef[] {
  return validators.map((validator): ValidatorDef => {
    if (validator.kind === "hook") {
      return {
        name: "hook",
        hook: composeHook(validator),
        arg: kindFind(validator.atoms, "default_arg")?.name.text,
      };
    }

    const name = validator.name.text;
    const args = validator.args.map(literalToConstantDef);
    const argt = args.map((a) => a.type);

    for (const v of ValidatorDefinition) {
      const [vType, vBpName, vName, vArgs] = v;
      if (_.isEqual(vType, fieldType) && vBpName === name && _.isEqual(vArgs, argt)) {
        const d: IValidatorDef = {
          name: vName,
          inputType: fieldType,
          args: args,
        };
        return d as ValidatorDef;
      }
    }

    throw new Error(`Unknown validator!`);
  });
}

function literalToConstantDef(literal: AST.Literal): ConstantDef {
  switch (literal.kind) {
    case "string":
      return { type: "text", value: literal.value };
    case "boolean":
      return { type: "boolean", value: literal.value };
    case "integer":
    case "float":
      return { type: "integer", value: literal.value };
    case "null":
      return { type: "null", value: literal.value };
  }
}

function defineReference(mdef: ModelDef, reference: AST.Reference): ReferenceDef {
  ensureEqual(reference.ref.kind, "modelAtom");
  const refKey = `${reference.ref.model}.${reference.ref.name}`;

  const refTo = kindFind(reference.atoms, "to")!.identifier.identifier.text;
  const fieldRefKey = `${refKey}_id`;
  const f: FieldDef = {
    kind: "field",
    refKey: fieldRefKey,
    modelRefKey: reference.ref.model,
    name: `${reference.ref.name}_id`,
    dbname: `${reference.ref.name}_id`.toLowerCase(),
    type: "integer",
    dbtype: "integer",
    primary: false,
    unique: reference.ref.unique,
    nullable: reference.type.kind === "nullable",
    validators: [],
  };
  mdef.fields.push(f);

  const ref: ReferenceDef = {
    kind: "reference",
    refKey,
    fieldRefKey,
    modelRefKey: reference.ref.model,
    toModelFieldRefKey: `${refTo}.id`,
    toModelRefKey: refTo,
    name: reference.ref.name,
    unique: reference.ref.unique,
    nullable: reference.type.kind === "nullable",
  };
  mdef.references.push(ref);

  return ref;
}

function defineRelation(mdef: ModelDef, relation: AST.Relation): RelationDef {
  ensureEqual(relation.ref.kind, "modelAtom");
  const refKey = `${relation.ref.model}.${relation.ref.name}`;

  const through = kindFind(relation.atoms, "through")?.identifier;
  ensureEqual(through?.ref.kind, "modelAtom");

  const rel: RelationDef = {
    kind: "relation",
    refKey,
    modelRefKey: mdef.refKey,
    name: relation.ref.name,
    fromModel: through.ref.model,
    fromModelRefKey: through.ref.model,
    through: through.ref.name,
    throughRefKey: `${through.ref.model}.${through.ref.name}`,
    nullable: through.type.kind === "nullable",
    unique: through.ref.unique,
  };
  mdef.relations.push(rel);
  return rel;
}

function defineQuery(models: AST.Model[], mdef: ModelDef, query: AST.Query): QueryDef {
  ensureEqual(query.ref.kind, "modelAtom");
  const refKey = `${query.ref.model}.${query.ref.name}`;

  const queryDef = queryFromSpec(models, mdef, query);
  queryDef.refKey = refKey;
  queryDef.select = []; // FIXME ??

  mdef.queries.push(queryDef);
  return queryDef;
}

function defineAggregate(models: AST.Model[], mdef: ModelDef, query: AST.Query): AggregateDef {
  ensureEqual(query.ref.kind, "modelAtom");
  const refKey = `${query.ref.model}.${query.ref.name}`;

  const queryDef = aggregateFromSpec(models, mdef, query);
  queryDef.refKey = refKey;

  mdef.aggregates.push(queryDef);
  return queryDef;
}

function defineModelHook(models: AST.Model[], mdef: ModelDef, hook: AST.ModelHook): ModelHookDef {
  ensureEqual(hook.ref.kind, "modelAtom");
  const refKey = `${hook.ref.model}.${hook.ref.name}`;

  const args = kindFilter(hook.atoms, "arg_query").map((arg) => ({
    name: arg.name.text,
    query: queryFromSpec(models, mdef, arg.query),
  }));

  const h: ModelHookDef = {
    kind: "model-hook",
    refKey,
    name: hook.ref.name,
    args,
    hook: composeHook(hook),
  };
  mdef.hooks.push(h);
  return h;
}

export function queryFromSpec(
  models: AST.Model[],
  model: ModelDef,
  query: AST.Query | AST.AnonymousQuery
): QueryDef {
  return composeQuery(models, model, query);
}

function aggregateFromSpec(models: AST.Model[], mdef: ModelDef, query: AST.Query): AggregateDef {
  return composeAggregate(models, mdef, query);
}

export function validateComputedType(type: string): ComputedDef["type"]["kind"] {
  switch (type) {
    case "text":
    case "integer":
    case "boolean":
    case "unknown":
    case "null":
      return type;
    // unsupported types are mapped to "unknown"
    case "float":
      return "unknown";
    default:
      throw new Error(`Invalid computed field type: "${type}"`);
  }
}

function constructDbType(type: FieldDef["type"]): FieldDef["dbtype"] {
  return type;
}

function defineImplicitRelation(projectASTs: AST.ProjectASTs, def: Definition) {
  const authenticator = kindFind(projectASTs.document, "authenticator");
  if (!authenticator) return;

  const authUserModelName = AUTH_TARGET_MODEL_NAME;
  const accessTokenModelName = `${authUserModelName}AccessToken`;
  const implicitModelNames = [authUserModelName, accessTokenModelName];
  const implicitModels = def.models.filter((m) => implicitModelNames.includes(m.name));

  def.models.forEach((model) => {
    if (implicitModelNames.includes(model.name)) return;
    model.references.forEach((reference) => {
      implicitModels.forEach((implicitModel) => {
        if (reference.toModelRefKey === implicitModel.name) {
          const relationName = `${_.camelCase(model.name)}${_.upperFirst(
            _.camelCase(reference.name)
          )}Rel`;
          const relation: RelationDef = {
            kind: "relation",
            refKey: `${implicitModel.name}.${relationName}`,
            modelRefKey: implicitModel.name,
            name: relationName,
            fromModel: model.name,
            fromModelRefKey: model.refKey,
            through: reference.name,
            throughRefKey: reference.refKey,
            nullable: reference.nullable,
            unique: reference.unique,
          };
          implicitModel.relations.push(relation);
        }
      });
    });
  });
}
