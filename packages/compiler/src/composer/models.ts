import { composeValidate } from "./validators";

import { Type } from "@compiler/compiler/ast/type";
import { composeExpression, composeQuery } from "@compiler/composer/query";
import { refKeyFromRef } from "@compiler/composer/utils";
import {
  ComputedDef,
  Definition,
  FieldDef,
  ModelDef,
  ModelHookDef,
  QueryDef,
  ReferenceDef,
  RelationDef,
  VariablePrimitiveType,
} from "@compiler/types/definition";
import * as Spec from "@compiler/types/specification";

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
    queries: spec.queries.map(defineQuery),
    aggregates: [],
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
    validate: fspec.validate && composeValidate(fspec.validate),
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
    onDelete: rspec.onDelete,
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
