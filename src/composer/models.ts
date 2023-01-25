import _ from "lodash";

import { processSelect } from "./entrypoints";
import { getTypedLiteralValue, getTypedPath } from "./utils";

import { Ref, RefKind, UnknownRefKeyError, getRef } from "@src/common/refs";
import { ensureEqual, ensureUnique } from "@src/common/utils";
import {
  getDirectChildren,
  getFilterPaths,
  queryFromParts,
  uniqueNamePaths,
} from "@src/runtime/query/build";
import { LiteralValue } from "@src/types/ast";
import {
  AggregateDef,
  ComputedDef,
  ConstantDef,
  Definition,
  FieldDef,
  FunctionName,
  IValidatorDef,
  ModelDef,
  ModelHookDef,
  QueryDef,
  ReferenceDef,
  RelationDef,
  TypedExprDef,
  ValidatorDef,
  ValidatorDefinition,
} from "@src/types/definition";
import {
  ComputedSpec,
  ExpSpec,
  FieldSpec,
  ModelHookSpec,
  ModelSpec,
  QuerySpec,
  ReferenceSpec,
  RelationSpec,
} from "@src/types/specification";

export function composeModels(def: Definition, specs: ModelSpec[]): void {
  // cache.clear();
  let needsExtraStep = true;
  function tryCall<T>(fn: () => T): T | null {
    try {
      return fn();
    } catch (e) {
      if (e instanceof UnknownRefKeyError) {
        needsExtraStep = true;
        return null;
      } else {
        throw e;
      }
    }
  }
  while (needsExtraStep) {
    const resolvedCount = def.resolveOrder.length;
    needsExtraStep = false;
    // ensure model uniqueness
    ensureUnique(specs.map((s) => s.name.toLowerCase()));
    specs.forEach((mspec) => {
      // ensure prop uniqueness
      ensureUnique([
        ...mspec.fields.map((f) => f.name.toLowerCase()),
        ...mspec.references.map((r) => r.name.toLowerCase()),
        ...mspec.relations.map((r) => r.name.toLowerCase()),
        ...mspec.queries.map((q) => q.name.toLowerCase()),
        ...mspec.computeds.map((c) => c.name.toLowerCase()),
      ]);
      const mdef = defineModel(def, mspec);
      mspec.fields.forEach((hspec) => defineField(def, mdef, hspec));
      mspec.computeds.forEach((cspec) => tryCall(() => defineComputed(def, mdef, cspec)));
      mspec.references.forEach((rspec) => tryCall(() => defineReference(def, mdef, rspec)));
      mspec.relations.forEach((rspec) => tryCall(() => defineRelation(def, mdef, rspec)));
      mspec.queries
        .filter((qspec) => !qspec.aggregate)
        .forEach((qspec) => tryCall(() => defineQuery(def, mdef, qspec)));
      mspec.queries
        .filter((qspec) => qspec.aggregate)
        .forEach((qspec) => tryCall(() => defineAggregate(def, mdef, qspec)));
      mspec.hooks.forEach((hspec) => tryCall(() => defineModelHook(def, mdef, hspec)));

      return mdef;
    });
    if (def.resolveOrder.length === resolvedCount && needsExtraStep) {
      // whole iteration has passed, nothing has changed, but not everything's defined
      throw new Error(`Couldn't resolve the spec`);
    }
  }
}

function getDefinition<T extends RefKind, F extends true | undefined>(
  def: Definition,
  refKey: string,
  type: T,
  fail?: F
): F extends true ? Ref<T> : Ref<T> | null {
  let ref: Ref<T>;
  try {
    ref = getRef(def, refKey, undefined, type);
  } catch (e) {
    if (fail) throw e;
    return null as F extends true ? Ref<T> : Ref<T> | null;
  }
  return ref;
}

function defineModel(def: Definition, spec: ModelSpec): ModelDef {
  const ex = getDefinition(def, spec.name, "model");
  if (ex) return ex;

  const model: ModelDef = {
    kind: "model",
    refKey: spec.name,
    name: spec.name,
    dbname: spec.name.toLowerCase(),
    fields: [],
    references: [],
    relations: [],
    queries: [],
    aggregates: [],
    computeds: [],
    hooks: [],
  };
  const idField = constructIdField(model);
  model.fields.push(idField);
  def.models.push(model);
  def.resolveOrder.push(model.refKey);
  return model;
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

function defineField(def: Definition, mdef: ModelDef, fspec: FieldSpec): FieldDef {
  const refKey = `${mdef.refKey}.${fspec.name}`;
  const ex = getDefinition(def, refKey, "field");
  if (ex) return ex;

  const type = validateType(fspec.type);

  const f: FieldDef = {
    kind: "field",
    refKey,
    modelRefKey: mdef.refKey,
    name: fspec.name,
    dbname: fspec.name.toLowerCase(),
    type,
    dbtype: constructDbType(type),
    primary: false,
    unique: !!fspec.unique,
    nullable: !!fspec.nullable,
    validators: validatorSpecsToDefs(type, fspec.validators),
  };
  mdef.fields.push(f);
  def.resolveOrder.push(f.refKey);
  return f;
}

function defineComputed(def: Definition, mdef: ModelDef, cspec: ComputedSpec): ComputedDef {
  const refKey = `${mdef.refKey}.${cspec.name}`;
  const ex = getDefinition(def, refKey, "computed");
  if (ex) return ex;

  const c: ComputedDef = {
    kind: "computed",
    refKey,
    modelRefKey: mdef.refKey,
    name: cspec.name,
    exp: composeExpression(def, cspec.exp, [mdef.name]),
  };
  mdef.computeds.push(c);
  def.resolveOrder.push(c.refKey);
  return c;
}

function validatorSpecsToDefs(
  fieldType: FieldDef["type"],
  vspecs: FieldSpec["validators"]
): ValidatorDef[] {
  if (vspecs === undefined) return [];

  return vspecs.map((vspec): ValidatorDef => {
    if (vspec.kind === "hook") {
      return { name: "hook", code: vspec.hook.code, arg: vspec.hook.arg };
    }

    const name = vspec.name;
    const args = vspec.args.map(literalToConstantDef);
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

function literalToConstantDef(literal: LiteralValue): ConstantDef {
  if (typeof literal === "number" && Number.isSafeInteger(literal))
    return { type: "integer", value: literal };
  if (!!literal === literal) return { type: "boolean", value: literal };
  if (literal === null) return { type: "null", value: null };
  if (typeof literal === "string") return { type: "text", value: literal };
  throw new Error(`Can't detect literal type from ${literal} : ${typeof literal}`);
}

function defineReference(def: Definition, mdef: ModelDef, rspec: ReferenceSpec): ReferenceDef {
  const refKey = `${mdef.refKey}.${rspec.name}`;
  const ex = getDefinition(def, refKey, "reference");
  if (ex) return ex;
  getDefinition(def, rspec.toModel, "model", true);

  const fieldRefKey = `${refKey}_id`; // or `Id`?? FIXME decide casing logic
  if (getDefinition(def, refKey, "field")) {
    throw new Error("Can't make reference field, name taken");
  }
  const f: FieldDef = {
    kind: "field",
    refKey: fieldRefKey,
    modelRefKey: mdef.refKey,
    name: `${rspec.name}_id`,
    dbname: `${rspec.name}_id`.toLowerCase(),
    type: "integer",
    dbtype: "integer",
    primary: false,
    unique: !!rspec.unique,
    nullable: !!rspec.nullable,
    validators: [],
  };
  mdef.fields.push(f);
  def.resolveOrder.push(f.refKey);

  const ref: ReferenceDef = {
    kind: "reference",
    refKey,
    fieldRefKey,
    modelRefKey: mdef.refKey,
    toModelFieldRefKey: `${rspec.toModel}.id`,
    toModelRefKey: rspec.toModel,
    name: rspec.name,
    unique: !!rspec.unique,
    nullable: !!rspec.nullable,
  };
  mdef.references.push(ref);
  def.resolveOrder.push(f.refKey);
  return ref;
}

function defineRelation(def: Definition, mdef: ModelDef, rspec: RelationSpec): RelationDef {
  const refKey = `${mdef.refKey}.${rspec.name}`;
  const ex = getDefinition(def, refKey, "relation");
  if (ex) return ex;

  getDefinition(def, rspec.fromModel, "model", true);
  const throughRef = getDefinition(def, `${rspec.fromModel}.${rspec.through}`, "reference", true);
  if (throughRef.toModelRefKey !== mdef.name) {
    throw new Error(
      `Relation ${mdef.name}.${rspec.name} is pointing to a reference referencing a model ${throughRef.toModelRefKey}`
    );
  }

  const rel: RelationDef = {
    kind: "relation",
    refKey,
    modelRefKey: mdef.refKey,
    name: rspec.name,
    fromModel: rspec.fromModel,
    fromModelRefKey: rspec.fromModel,
    through: rspec.through,
    throughRefKey: throughRef.refKey,
    nullable: throughRef.nullable,
    unique: throughRef.unique,
  };
  mdef.relations.push(rel);
  def.resolveOrder.push(rel.refKey);
  return rel;
}

function defineQuery(def: Definition, mdef: ModelDef, qspec: QuerySpec): QueryDef {
  const refKey = `${mdef.refKey}.${qspec.name}`;
  const ex = getDefinition(def, refKey, "query");
  if (ex) return ex;

  const query = queryFromSpec(def, mdef, qspec);
  query.refKey = refKey;
  query.select = []; // FIXME ??

  mdef.queries.push(query);
  def.resolveOrder.push(query.refKey);
  return query;
}

function defineAggregate(def: Definition, mdef: ModelDef, qspec: QuerySpec): AggregateDef {
  const refKey = `${mdef.refKey}.${qspec.name}`;
  const ex = getDefinition(def, refKey, "aggregate");
  if (ex) return ex;

  const query = aggregateFromSpec(def, mdef, qspec);
  query.refKey = refKey;

  mdef.aggregates.push(query);
  def.resolveOrder.push(query.refKey);
  return query;
}

function defineModelHook(def: Definition, mdef: ModelDef, hspec: ModelHookSpec): ModelHookDef {
  const refKey = `${mdef.refKey}.${hspec.name}`;
  const ex = getDefinition(def, refKey, "model-hook");
  if (ex) return ex;

  const args = hspec.args.map(({ name, query }) => ({
    name,
    query: queryFromSpec(def, mdef, query),
  }));

  const h: ModelHookDef = {
    kind: "model-hook",
    refKey,
    name: hspec.name,
    args,
    code: hspec.code,
  };
  mdef.hooks.push(h);
  def.resolveOrder.push(h.refKey);
  return h;
}

function queryFromSpec(def: Definition, mdef: ModelDef, qspec: QuerySpec): QueryDef {
  if (qspec.aggregate) {
    throw new Error(`Can't build a QueryDef when QuerySpec contains an aggregate`);
  }
  const fromPath = [mdef.name, ...qspec.fromModel];
  const filter = qspec.filter && composeExpression(def, qspec.filter, fromPath);

  const filterPaths = getFilterPaths(filter);
  const paths = uniqueNamePaths([fromPath, ...filterPaths]);
  const direct = getDirectChildren(paths);
  ensureEqual(direct.length, 1);
  const targetModel = getRef.model(def, direct[0]);
  const select = processSelect(def, targetModel, qspec.select, fromPath);

  return queryFromParts(def, qspec.name, fromPath, filter, select);
}

function aggregateFromSpec(def: Definition, mdef: ModelDef, qspec: QuerySpec): AggregateDef {
  const aggregate = qspec.aggregate?.name;
  if (!aggregate) {
    throw new Error(`Can't build an AggregateDef when QuerySpec doesn't contain an aggregate`);
  }
  if (qspec.select) {
    throw new Error(`Aggregate query can't have a select`);
  }
  const qdef = queryFromSpec(def, mdef, { ...qspec, aggregate: undefined });
  const { refKey } = qdef;
  const query = _.omit(qdef, ["refKey", "name", "select"]);

  if (aggregate !== "sum" && aggregate !== "count") {
    throw new Error(`Unknown aggregate function ${aggregate}`);
  }

  return {
    refKey,
    kind: "aggregate",
    aggrFnName: aggregate,
    targetPath: [mdef.refKey, "id"],
    name: qspec.name,
    query,
  };
}

function typedFunctionFromParts(
  def: Definition,
  name: string,
  args: ExpSpec[],
  namePath: string[]
): TypedExprDef {
  return {
    kind: "function",
    name: name as FunctionName, // FIXME proper validation
    args: args.map((arg) => composeExpression(def, arg, namePath)),
  };
}

function composeExpression(def: Definition, exp: ExpSpec, namePath: string[]): TypedExprDef {
  switch (exp.kind) {
    case "literal": {
      return getTypedLiteralValue(exp.literal);
    }
    case "identifier": {
      const np = [...namePath, ...exp.identifier];
      // ensure everything resolves
      getTypedPath(def, np, {});
      return { kind: "alias", namePath: np };
    }
    // everything else composes to a function
    case "unary": {
      return typedFunctionFromParts(
        def,
        "not",
        [exp.exp, { kind: "literal", literal: true }],
        namePath
      );
    }
    case "binary": {
      return typedFunctionFromParts(def, exp.operator, [exp.lhs, exp.rhs], namePath);
    }
    case "function": {
      return typedFunctionFromParts(def, exp.name, exp.args, namePath);
    }
  }
}

function validateType(type: string): FieldDef["type"] {
  switch (type) {
    case "integer":
      return "integer";
    case "text":
      return "text";
    case "boolean":
      return "boolean";
    default:
      throw new Error(`Field type ${type} is not a valid type`);
  }
}

function constructDbType(type: FieldDef["type"]): FieldDef["dbtype"] {
  return type;
}
