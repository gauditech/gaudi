import _ from "lodash";

import { Type } from "@src/compiler/ast/type";
import { composeAggregate, composeExpression, composeQuery } from "@src/composer/query";
import { refKeyFromRef } from "@src/composer/utils";
import {
  AggregateDef,
  ComputedDef,
  Definition,
  FieldDef,
  IValidatorDef,
  ModelDef,
  ModelHookDef,
  QueryDef,
  ReferenceDef,
  RelationDef,
  ValidatorDef,
  ValidatorDefinition,
  VariablePrimitiveType,
} from "@src/types/definition";
import * as Spec from "@src/types/specification";

export function composeModels(def: Definition, modelSpecs: Spec.Model[]): void {
  def.models = modelSpecs.map((mspec) => defineModel(mspec));
}

function defineModel(spec: Spec.Model): ModelDef {
  return {
    kind: "model",
    refKey: spec.name,
    name: spec.name,
    dbname: spec.name.toLowerCase(),
    fields: spec.fields.map(defineField),
    references: spec.references.map(defineReference),
    relations: spec.relations.map(defineRelation),
    queries: spec.queries.filter((qspec) => !qspec.aggregate).map(defineQuery),
    aggregates: spec.queries.filter((qspec) => qspec.aggregate).map(defineAggregate),
    computeds: spec.computeds.map(defineComputed),
    hooks: spec.hooks.map(defineModelHook),
  };
}

function defineField(fspec: Spec.Field): FieldDef {
  return {
    kind: "field",
    refKey: refKeyFromRef(fspec.ref),
    modelRefKey: fspec.ref.parentModel,
    name: fspec.ref.name,
    dbname: fspec.ref.name.toLowerCase(),
    type: fspec.ref.type,
    primary: fspec.primary,
    unique: fspec.ref.unique,
    nullable: fspec.ref.nullable,
    validators: composeValidators(fspec.ref.type, fspec.validators),
  };
}

function defineComputed(cspec: Spec.Computed): ComputedDef {
  return {
    kind: "computed",
    refKey: refKeyFromRef(cspec.ref),
    modelRefKey: cspec.ref.parentModel,
    name: cspec.name,
    exp: composeExpression(cspec.expr, [cspec.ref.parentModel]),
    type: defineType(cspec.expr.type),
  };
}

export function composeValidators(
  fieldType: FieldDef["type"],
  vspecs: Spec.Field["validators"]
): ValidatorDef[] {
  if (vspecs === undefined) return [];

  return vspecs.map((vspec): ValidatorDef => {
    if (vspec.kind === "hook") {
      return { name: "hook", hook: vspec.hook.code, arg: vspec.hook.arg };
    }

    const name = vspec.name;
    const args = vspec.args;
    const argt = args.map((a) => a.kind);

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

function defineReference(rspec: Spec.Reference): ReferenceDef {
  const refToModelName = rspec.to.model;
  const refKey = refKeyFromRef(rspec.ref);

  return {
    kind: "reference",
    refKey,
    fieldRefKey: `${refKey}_id`,
    modelRefKey: rspec.ref.parentModel,
    toModelFieldRefKey: `${refToModelName}.id`,
    toModelRefKey: refToModelName,
    name: rspec.name,
    unique: !!rspec.unique,
    nullable: !!rspec.nullable,
  };
}

function defineRelation(rspec: Spec.Relation): RelationDef {
  return {
    kind: "relation",
    refKey: refKeyFromRef(rspec.ref),
    modelRefKey: rspec.ref.parentModel,
    name: rspec.name,
    fromModel: rspec.through.parentModel,
    fromModelRefKey: rspec.through.parentModel,
    through: rspec.through.name,
    throughRefKey: refKeyFromRef(rspec.through),
    unique: rspec.unique,
  };
}

function defineQuery(qspec: Spec.Query): QueryDef {
  const refKey = `${qspec.sourceModel}.${qspec.name}`;

  const query = composeQuery(qspec);
  query.refKey = refKey;
  query.select = []; // FIXME ??

  return query;
}

function defineAggregate(qspec: Spec.Query): AggregateDef {
  const refKey = `${qspec.sourceModel}.${qspec.name}`;

  const query = composeAggregate(qspec);
  query.refKey = refKey;

  return query;
}

function defineModelHook(hspec: Spec.ModelHook): ModelHookDef {
  const args = hspec.args.map(({ name, query }) => ({
    name,
    query: composeQuery(query),
  }));

  return {
    kind: "model-hook",
    refKey: refKeyFromRef(hspec.ref),
    name: hspec.name,
    args,
    hook: hspec.code,
  };
}

export function defineType(type: Type, nullable = false): VariablePrimitiveType {
  switch (type.kind) {
    case "primitive": {
      switch (type.primitiveKind) {
        case "string":
          return { kind: "string", nullable };
        case "float":
          return { kind: "integer", nullable };
        default:
          return { kind: type.primitiveKind, nullable };
      }
    }
    case "null":
      return { kind: "null", nullable: true };
    case "nullable":
      return defineType(type.type, true);
    default:
      throw new Error(`Invalid computed field type: "${type}"`);
  }
}
