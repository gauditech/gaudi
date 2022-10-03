import { ensureUnique, nameInitials } from "@src/common/utils";
import {
  Definition,
  FieldDef,
  ModelDef,
  QueryDef,
  QueryDefPath,
  ReferenceDef,
  RelationDef,
} from "@src/types/definition";
import {
  ExpSpec,
  FieldSpec,
  ModelSpec,
  QuerySpec,
  ReferenceSpec,
  RelationSpec,
  Specification,
} from "@src/types/specification";

enum RefType {
  Model = "model",
  Field = "field",
  Reference = "reference",
  Relation = "relation",
  Query = "query",
  Computed = "computed",
}

type Mapping = {
  [RefType.Model]: ModelDef;
  [RefType.Field]: FieldDef;
  [RefType.Reference]: ReferenceDef;
  [RefType.Relation]: RelationDef;
  [RefType.Query]: QueryDef;
  [RefType.Computed]: ModelDef;
};

type Cached<T extends RefType> = [T, Mapping[T]];
const cache = new Map<string, Cached<RefType>>();

export function compose(input: Specification): Definition {
  cache.clear();
  return {
    models: composeModels(input.models),
  };
}

function composeModels(specs: ModelSpec[]): ModelDef[] {
  let needsExtraStep = true;
  function tryCall<T>(fn: () => T): T | null {
    try {
      return fn();
    } catch (e) {
      if (Array.isArray(e) && e[0] === "cache-miss") {
        needsExtraStep = true;
        return null;
      } else {
        throw e;
      }
    }
  }
  let defs: ModelDef[] = [];
  while (needsExtraStep) {
    const cacheSize = cache.size;
    needsExtraStep = false;
    // ensure model uniqueness
    ensureUnique(specs.map((s) => s.name.toLowerCase()));
    defs = specs.map((mspec) => {
      // ensure prop uniqueness
      ensureUnique([
        ...mspec.fields.map((f) => f.name.toLowerCase()),
        ...mspec.references.map((r) => r.name.toLowerCase()),
        ...mspec.relations.map((r) => r.name.toLowerCase()),
        ...mspec.queries.map((q) => q.name.toLowerCase()),
        ...mspec.computeds.map((c) => c.name.toLowerCase()),
      ]);
      const mdef = defineModel(mspec);
      mspec.fields.forEach((fspec) => {
        defineField(mdef, fspec);
      });
      mspec.references.forEach((rspec) => {
        tryCall(() => defineReference(mdef, rspec));
      });
      mspec.relations.forEach((rspec) => {
        tryCall(() => defineRelation(mdef, rspec));
      });
      mspec.queries.forEach((qspec) => {
        tryCall(() => defineQuery(mdef, qspec));
      });

      return mdef;
    });
    if (cache.size === cacheSize) {
      // whole iteration has passed, nothing has changed
      throw "infinite-loop";
    }
  }
  return defs;
}

function getDefinition<T extends RefType, F extends true | undefined>(
  refKey: string,
  type: T,
  fail?: F
): F extends true ? Mapping[T] : Mapping[T] | null {
  const definition = cache.get(refKey);
  if (!definition) {
    if (fail) {
      throw ["cache-miss", refKey];
    } else {
      return null as F extends true ? Mapping[T] : Mapping[T] | null;
    }
  }
  try {
    ensureEqual(type, definition[0]);
  } catch (e) {
    throw new Error(`Expecting type ${type} but found a type ${definition[0]}`);
  }
  return definition[1] as F extends true ? Mapping[T] : Mapping[T] | null;
}

function defineModel(spec: ModelSpec): ModelDef {
  const ex = getDefinition(spec.name, RefType.Model);
  if (ex) return ex;

  const model: ModelDef = {
    dbname: spec.name.toLowerCase(),
    name: spec.name,
    refKey: spec.name,
    fields: [],
    references: [],
    relations: [],
    queries: [],
  };
  const idField = constructIdField(model);
  cache.set(idField.refKey, [RefType.Field, idField]);

  model.fields.push(idField);
  cache.set(model.refKey, [RefType.Model, model]);
  return model;
}

function constructIdField(mdef: ModelDef): FieldDef {
  return {
    refKey: `${mdef.refKey}.id`,
    modelRefKey: mdef.refKey,
    name: "id",
    dbname: "id",
    type: "integer",
    dbtype: "serial",
    primary: true,
    unique: true,
    nullable: false,
  };
}

function defineField(mdef: ModelDef, fspec: FieldSpec): FieldDef {
  const refKey = `${mdef.refKey}.${fspec.name}`;
  const ex = getDefinition(refKey, RefType.Field);
  if (ex) return ex;

  const f: FieldDef = {
    refKey,
    modelRefKey: mdef.refKey,
    name: fspec.name,
    dbname: fspec.name.toLowerCase(),
    type: validateType(fspec.type),
    dbtype: constructDbType(validateType(fspec.type)),
    primary: false,
    unique: !!fspec.unique,
    nullable: !!fspec.nullable,
  };
  cache.set(refKey, [RefType.Field, f]);
  mdef.fields.push(f);
  return f;
}

function defineReference(mdef: ModelDef, rspec: ReferenceSpec): ReferenceDef {
  const refKey = `${mdef.refKey}.${rspec.name}`;
  const ex = getDefinition(refKey, RefType.Reference);
  if (ex) return ex;
  getDefinition(rspec.toModel, RefType.Model, true);

  const fieldRefKey = `${refKey}_id`; // or `Id`?? FIXME decide casing logic
  if (getDefinition(refKey, RefType.Field)) {
    throw new Error("Can't make reference field, name taken");
  }
  const f: FieldDef = {
    refKey: fieldRefKey,
    modelRefKey: mdef.refKey,
    name: `${rspec.name}_id`,
    dbname: `${rspec.name}_id`.toLowerCase(),
    type: "integer",
    dbtype: "integer",
    primary: false,
    unique: !!rspec.unique,
    nullable: !!rspec.nullable,
  };
  cache.set(fieldRefKey, [RefType.Field, f]);
  mdef.fields.push(f);

  const ref: ReferenceDef = {
    refKey,
    fieldRefKey,
    modelRefKey: mdef.refKey,
    toModelFieldRefKey: `${rspec.toModel}.id`,
    toModelRefKey: rspec.toModel,
    name: rspec.name,
    unique: !!rspec.unique,
    nullable: !!rspec.nullable,
  };
  cache.set(refKey, [RefType.Reference, ref]);
  mdef.references.push(ref);
  return ref;
}

function defineRelation(mdef: ModelDef, rspec: RelationSpec): RelationDef {
  const refKey = `${mdef.refKey}.${rspec.name}`;
  const ex = getDefinition(refKey, RefType.Relation);
  if (ex) return ex;

  getDefinition(rspec.fromModel, RefType.Model, true);
  const throughRef = getDefinition(`${rspec.fromModel}.${rspec.through}`, RefType.Reference, true);

  const rel: RelationDef = {
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
  cache.set(refKey, [RefType.Relation, rel]);
  mdef.relations.push(rel);
  return rel;
}

function defineQuery(mdef: ModelDef, qspec: QuerySpec): QueryDef {
  const refKey = `${mdef.refKey}.${qspec.name.toLowerCase()}`;
  const ex = getDefinition(refKey, RefType.Query);
  if (ex) return ex;

  const filterPaths = qspec.filter ? getFilterPaths(qspec.filter) : [];
  // detect default context for each filter
  for (const path of filterPaths) {
    // TODO no bpAliases support yet, so all must belong to leaf context
    path.unshift(...qspec.fromModel);
  }
  const collect = [qspec.fromModel, ...filterPaths];
  // flatten?

  const paths = defineQueryJoinPaths(mdef, `${nameInitials(mdef.name)}`, collect);
  const [mainPath, leaf] = qspec.fromModel.reduce(
    (a, from): [QueryDefPath[], QueryDefPath] => {
      const next = a[1].joinPaths.find((p) => p.name === from)!;
      a[0].push(next);
      return [a[0], next];
    },
    [
      [],
      {
        name: "",
        joinPaths: paths,
      } as QueryDefPath,
    ] as [QueryDefPath[], QueryDefPath]
  );

  const query: QueryDef = {
    refKey,
    name: qspec.name,
    retType: leaf.retType,
    retCardinality: mainPath.every((v) => v.retCardinality === "one") ? "one" : "many",
    nullable: leaf.nullable,
    joinPaths: paths,
    filters: [],
  };

  cache.set(`${mdef.name}.${qspec.name.toLowerCase()}`, [RefType.Query, query]);
  mdef.queries.push(query);
  return query;
}

function filterCollects(path: string, collect: string[][]): string[][] {
  return collect.filter((c) => c[0] === path && c.length > 1).map((c) => c.slice(1, c.length));
}

function defineQueryJoinPaths(mdef: ModelDef, prefix: string, collect: string[][]): QueryDefPath[] {
  const directCollect = Array.from(new Set(collect.map((c) => c[0])));
  return directCollect
    .map((name, index): QueryDefPath | undefined => {
      const refKey = `${mdef.refKey}.${name}`;
      const target = cache.get(refKey);
      if (!target) throw ["cache-miss", name];

      const alias = `${prefix}.${nameInitials(name)}${index}`;

      switch (target[0]) {
        case RefType.Model:
          throw new Error(`${target[0]} type is not supported in queries`);
        case RefType.Field:
        case RefType.Computed:
          return;
        case RefType.Reference: {
          const reference = getDefinition(refKey, target[0], true);
          const toModel = getDefinition(reference.toModelRefKey, RefType.Model, true);
          return {
            refKey,
            name,
            retType: toModel.name,
            retCardinality: "one",
            alias,
            bpAlias: null,
            nullable: reference.nullable, // FIXME filters?
            joinType: "inner", // FIXME filters?
            joinPaths: defineQueryJoinPaths(toModel, alias, filterCollects(name, collect)),
            select: [],
          };
        }
        case RefType.Relation: {
          const relation = getDefinition(refKey, target[0], true);
          const fromModel = getDefinition(relation.fromModelRefKey, RefType.Model, true);
          return {
            refKey,
            name,
            retType: fromModel.name,
            retCardinality: relation.unique ? "one" : "many",
            alias,
            bpAlias: null,
            nullable: relation.nullable,
            joinType: "inner",
            joinPaths: defineQueryJoinPaths(fromModel, alias, filterCollects(name, collect)),
            select: [],
          };
        }
        case RefType.Query: {
          const query = getDefinition(refKey, target[0], true);
          const model = getDefinition(query.retType, RefType.Model, true);
          return {
            refKey,
            name,
            retType: query.retType,
            retCardinality: query.retCardinality,
            alias,
            bpAlias: null,
            nullable: query.nullable, // FIXME may be nullable if filters are applied
            joinType: "inner",
            joinPaths: defineQueryJoinPaths(model, alias, filterCollects(name, collect)),
            select: [],
          };
        }
      }
    })
    .filter((ret): ret is QueryDefPath => !!ret);
}

function getFilterPaths(filter: ExpSpec): string[][] {
  switch (filter.kind) {
    case "literal":
      return [];
    case "unary": {
      return getFilterPaths(filter.exp);
    }
    case "identifier":
      return [[...filter.identifier]];
    case "binary": {
      return [...getFilterPaths(filter.lhs), ...getFilterPaths(filter.rhs)];
    }
  }
}

function ensureEqual<T>(a: T, b: T): a is T {
  if (a === b) return true;
  throw new Error("Not equal");
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
