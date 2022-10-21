import _ from "lodash";

import { Ref, RefKind, getRef } from "@src/common/refs";
import { ensureEqual, ensureUnique } from "@src/common/utils";
import {
  getDirectChildren,
  getFilterPaths,
  getRelatedPaths,
  mergePaths,
  processPaths,
} from "@src/runtime/query";
import { LiteralValue } from "@src/types/ast";
import {
  Definition,
  FieldDef,
  FilterDef,
  LiteralFilterDef,
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
} from "@src/types/specification";

function refCount(def: Definition): number {
  return def.models.flatMap((m) => [...m.fields, ...m.references, ...m.relations, ...m.queries])
    .length;
}

export function composeModels(def: Definition, specs: ModelSpec[]): void {
  // cache.clear();
  let needsExtraStep = true;
  function tryCall<T>(fn: () => T): T | null {
    try {
      return fn();
    } catch (e) {
      if (Array.isArray(e) && e[0] === "unknown-refkey") {
        needsExtraStep = true;
        return null;
      } else {
        throw e;
      }
    }
  }
  while (needsExtraStep) {
    const cacheSize = refCount(def);
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
      mspec.fields.forEach((fspec) => {
        defineField(def, mdef, fspec);
      });
      mspec.references.forEach((rspec) => {
        tryCall(() => defineReference(def, mdef, rspec));
      });
      mspec.relations.forEach((rspec) => {
        tryCall(() => defineRelation(def, mdef, rspec));
      });
      mspec.queries.forEach((qspec) => {
        tryCall(() => defineQuery(def, mdef, qspec));
      });

      return mdef;
    });
    if (refCount(def) === cacheSize && needsExtraStep) {
      // whole iteration has passed, nothing has changed, but not everything's defined
      throw "infinite-loop";
    }
  }
}

function getDefinition<T extends RefKind, F extends true | undefined>(
  def: Definition,
  refKey: string,
  type: T,
  fail?: F
): F extends true ? Ref<T>["value"] : Ref<T>["value"] | null {
  let ref: Ref<T>;
  try {
    ref = getRef<T>(def, refKey);
  } catch (e) {
    if (fail) throw e;
    return null as F extends true ? Ref<T>["value"] : Ref<T>["value"] | null;
  }
  try {
    ensureEqual(ref.kind, type);
  } catch (e) {
    throw new Error(`Expecting type ${type} but found a type ${ref.kind}`);
  }
  return ref.value;
}

function defineModel(def: Definition, spec: ModelSpec): ModelDef {
  const ex = getDefinition(def, spec.name, "model");
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
  model.fields.push(idField);
  def.models.push(model);
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

function defineField(def: Definition, mdef: ModelDef, fspec: FieldSpec): FieldDef {
  const refKey = `${mdef.refKey}.${fspec.name}`;
  const ex = getDefinition(def, refKey, "field");
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
  mdef.fields.push(f);
  return f;
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
  mdef.references.push(ref);
  return ref;
}

function defineRelation(def: Definition, mdef: ModelDef, rspec: RelationSpec): RelationDef {
  const refKey = `${mdef.refKey}.${rspec.name}`;
  const ex = getDefinition(def, refKey, "relation");
  if (ex) return ex;

  getDefinition(def, rspec.fromModel, "model", true);
  const throughRef = getDefinition(def, `${rspec.fromModel}.${rspec.through}`, "reference", true);

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
  mdef.relations.push(rel);
  return rel;
}

function getLeaf(def: Definition, paths: QueryDefPath[], namePath: string[]): QueryDefPath {
  const node = paths.find((p) => {
    const ref = getRef(def, p.refKey);
    return ref.value.name === namePath[1];
  })!;
  console.log(node);
  return namePath.length === 2 ? node : getLeaf(def, node.joinPaths, _.tail(namePath));
}

function defineQuery(def: Definition, mdef: ModelDef, qspec: QuerySpec): QueryDef {
  const refKey = `${mdef.refKey}.${qspec.name}`;
  const ex = getDefinition(def, refKey, "query");
  if (ex) return ex;

  const filter = convertFilter(qspec.filter);
  const fromPath = [mdef.name, ...qspec.fromModel];

  const filterPaths = qspec.filter ? getFilterPaths(filter) : [];
  // detect default context for each filter
  for (const path of filterPaths) {
    // TODO no bpAliases support yet, so all must belong to leaf context
    path.unshift(...fromPath);
  }
  const collect = mergePaths([fromPath, ...filterPaths]);
  const direct = getDirectChildren(collect);
  ensureEqual(direct.length, 1);
  const joinPaths = processPaths(def, getRelatedPaths(collect, direct[0]), mdef, [mdef.name]);

  const retLeaf = getLeaf(def, joinPaths, fromPath);

  const query: QueryDef = {
    refKey,
    from: { kind: "model", refKey: mdef.refKey },
    name: qspec.name,
    fromPath: fromPath,
    retType: retLeaf.retType,
    retCardinality: joinPaths.every((p) => p.retCardinality === "one") ? "one" : "many",
    nullable: getRef<QueryDefPath["kind"]>(def, retLeaf.refKey).value.nullable,
    joinPaths,
    // FIXME validate filter!!
    filter: qspec.filter && convertFilter(qspec.filter),
  };

  // TODO validate and "correct" filters
  // TODO left joins and null checks
  // TODO automatic ID fields
  // TODO add computeds

  mdef.queries.push(query);
  return query;
}

function getLiteralType(literal: LiteralValue): LiteralFilterDef["type"] {
  if (typeof literal === "string") return "text";
  if (typeof literal === "number") return "integer";
  if (typeof literal === "boolean") return "boolean";
  if (literal === "null") return "null";
  throw new Error(`Literal ${literal} not supported`);
}

function convertFilter(filter: ExpSpec | undefined): FilterDef {
  switch (filter?.kind) {
    case undefined:
      return undefined;
    case "literal": {
      return {
        kind: "literal",
        type: getLiteralType(filter.literal),
        value: filter.literal,
      } as FilterDef;
    }
    case "unary": {
      return {
        kind: "binary",
        operator: "is not",
        lhs: convertFilter(filter.exp),
        rhs: { kind: "literal", type: "boolean", value: true },
      };
    }
    case "binary": {
      return {
        kind: "binary",
        operator: filter.operator,
        lhs: convertFilter(filter.lhs),
        rhs: convertFilter(filter.rhs),
      };
    }
    case "identifier": {
      return {
        kind: "alias",
        namePath: filter.identifier,
      };
    }
  }
}

// function defineQueryPathDeps(
//   mdef: ModelDef,
//   prefix: string[],
//   collect: string[][]
// ): Pick<QueryDefPath, "select" | "joinPaths"> {
//   const directCollect = Array.from(new Set(collect.map((c) => c[0])));
//   const selectsAndJoins = directCollect.map(
//     (name, _index): ["select", QueryDefPathSelect] | ["join", QueryDefPath] => {
//       const refKey = `${mdef.refKey}.${name}`;
//       const target = cache.get(refKey);
//       if (!target) throw ["cache-miss", name];

//       const namePath = [...prefix, name];
//       switch (target[0]) {
//         case RefType.Model:
//           throw new Error(`${target[0]} type is not supported in queries`);
//         case RefType.Field: {
//           const field = getDefinition(refKey, RefType.Field, true);
//           return [
//             "select",
//             {
//               refKey,
//               name,
//               namePath,
//               retType: field.type,
//               nullable: field.nullable,
//             },
//           ];
//         }
//         case RefType.Computed: {
//           throw new Error("TODO");
//         }
//         case RefType.Reference: {
//           const reference = getDefinition(refKey, target[0], true);
//           const toModel = getDefinition(reference.toModelRefKey, RefType.Model, true);
//           return [
//             "join",
//             {
//               refKey,
//               name,
//               retType: toModel.name,
//               retCardinality: "one",
//               namePath,
//               bpAlias: null,
//               nullable: reference.nullable, // FIXME filters?
//               joinType: "inner", // FIXME filters?
//               ...defineQueryPathDeps(toModel, namePath, filterCollects(name, collect)),
//             },
//           ];
//         }
//         case RefType.Relation: {
//           const relation = getDefinition(refKey, target[0], true);
//           const fromModel = getDefinition(relation.fromModelRefKey, RefType.Model, true);
//           return [
//             "join",
//             {
//               refKey,
//               name,
//               retType: fromModel.name,
//               retCardinality: relation.unique ? "one" : "many",
//               namePath,
//               bpAlias: null,
//               nullable: relation.nullable,
//               joinType: "inner",
//               ...defineQueryPathDeps(fromModel, namePath, filterCollects(name, collect)),
//             },
//           ];
//         }
//         case RefType.Query: {
//           const query = getDefinition(refKey, target[0], true);
//           const model = getDefinition(query.retType, RefType.Model, true);
//           return [
//             "join",
//             {
//               refKey,
//               name,
//               retType: query.retType,
//               retCardinality: query.retCardinality,
//               namePath,
//               bpAlias: null,
//               nullable: query.nullable, // FIXME may be nullable if filters are applied
//               joinType: "inner",
//               ...defineQueryPathDeps(model, namePath, filterCollects(name, collect)),
//             },
//           ];
//         }
//       }
//     }
//   );
//   const select = selectsAndJoins
//     .filter((s) => s[0] === "select")
//     .map((s) => s[1]) as QueryDefPathSelect[];
//   const joinPaths = selectsAndJoins
//     .filter((s) => s[0] === "join")
//     .map((s) => s[1]) as QueryDefPath[];
//   return { select, joinPaths };
// }

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
