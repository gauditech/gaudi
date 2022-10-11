import { source } from "common-tags";
import _ from "lodash";

import { PathParam } from "./renderer/templates/server/endpoints.tpl";

import { BinaryOperator } from "@src/types/ast";
import {
  Definition,
  EntrypointDef,
  FieldDef,
  FilterDef,
  ModelDef,
  QueryDef,
  ReferenceDef,
  RelationDef,
} from "@src/types/definition";

type Queriable = {
  modelRefKey: string;
  joins: Join[];
  filter: FilterDef;
  // select: SelectDef;
};

type Join = {
  name: string;
  namePath: string[];
  kind: "relation" | "reference" | "query";
  refKey: string;
  joinType: "inner" | "left";
  on: FilterDef;
  joins: Join[];
};

type EpWithVar = [EntrypointDef, string | undefined];

export function buildTargetsSQL(
  def: Definition,
  entrypoints: EntrypointDef[],
  param: PathParam
): string {
  const inputs = _.zip(
    entrypoints,
    param.params.map((p) => p.name)
  ) as EpWithVar[];
  const q = queriableEntrypoints(def, inputs);
  return queriableToString(def, q);
}

export function queriableEntrypoints(def: Definition, inputs: EpWithVar[]): Queriable {
  const [[modelEp, varName], ...rest] = inputs;
  return {
    modelRefKey: modelEp.target.refKey,
    filter: varName
      ? {
          kind: "binary",
          operator: "is",
          lhs: { kind: "alias", namePath: [modelEp.target.name, modelEp.target.identifyWith.name] },
          rhs: {
            kind: "variable",
            type: modelEp.target.identifyWith.type,
            name: varName,
          },
        }
      : undefined,
    joins: queriableJoins(def, rest, [modelEp.target.name]).map((j) => forceLeftJoins(j)),
  };
}

function forceLeftJoins(j: Join): Join {
  return { ...j, joinType: "left", joins: j.joins.map((j) => forceLeftJoins(j)) };
}

function queriableJoins(def: Definition, inputs: EpWithVar[], parentNamePath: string[]): Join[] {
  if (!inputs.length) return [];
  const [[ep, varName], ...rest] = inputs;
  if (ep.target.kind === "model") throw new Error(`Cannot join with models!`);
  const namePath = [...parentNamePath, ep.target.name];

  const joinNames = getJoinNames(def, ep.target.refKey);

  return [
    {
      name: ep.target.name,
      refKey: ep.target.refKey,
      namePath,
      kind: ep.target.kind,
      joinType: "inner",
      on: {
        kind: "binary",
        operator: "and",
        lhs: {
          kind: "binary",
          operator: "is",
          lhs: { kind: "alias", namePath: [...parentNamePath, joinNames.that] },
          rhs: { kind: "alias", namePath: [...namePath, joinNames.this] },
        },
        rhs: varName
          ? {
              kind: "binary",
              operator: "is",
              lhs: { kind: "alias", namePath: [...namePath, ep.target.identifyWith.name] },
              rhs: {
                kind: "variable",
                type: ep.target.identifyWith.type,
                name: varName,
              },
            }
          : undefined,
      },
      joins: queriableJoins(def, rest, namePath),
    },
  ];
}

function getJoinNames(def: Definition, refKey: string): { this: string; that: string } {
  const prop = getRef<"reference" | "relation">(def, refKey);
  switch (prop.kind) {
    case "reference": {
      const reference = prop.value as ReferenceDef;
      const { value: field } = getRef<"field">(def, reference.fieldRefKey);
      const { value: refField } = getRef<"field">(def, reference.toModelFieldRefKey);

      return { this: field.name, that: refField.name };
    }
    case "relation": {
      const relation = prop.value as RelationDef;
      const { value: reference } = getRef<"reference">(def, relation.throughRefKey);
      const { value: field } = getRef<"field">(def, reference.fieldRefKey);
      const { value: refField } = getRef<"field">(def, reference.toModelFieldRefKey);

      return { this: field.name, that: refField.name };
    }
    default:
      throw new Error(`Kind ${prop.kind} not supported`);
  }
}

function toAlias(np: string[]): string {
  return `"${np.join(".")}"`;
}

function getTargetModel(def: Definition, refKey: string): ModelDef {
  const prop = getRef(def, refKey);
  switch (prop.kind) {
    case "reference": {
      return getRef<"model">(def, (prop.value as ReferenceDef).toModelRefKey).value;
    }
    case "relation": {
      return getRef<"model">(def, (prop.value as RelationDef).fromModelRefKey).value;
    }
    default:
      throw new Error(`Kind ${prop.kind} not supported`);
  }
}

function filterToString(filter: FilterDef): string {
  if (filter === undefined) return "true = true";
  switch (filter.kind) {
    case "literal": {
      switch (filter.type) {
        case "boolean":
          return filter.value ? "TRUE" : "FALSE";
        case "null":
          return "NULL";
        case "text":
          return `'${filter.value}'`;
        case "integer":
          return filter.value.toString();
      }
    }
    // Due to bug in eslint/prettier, linter complains that `break` is expected in the case "literal"
    // Since inner switch is exaustive, break is unreachable so prettier deletes it
    // eslint-disable-next-line no-fallthrough
    case "alias": {
      const np = filter.namePath.slice(0, filter.namePath.length - 1);
      const f = filter.namePath.at(filter.namePath.length - 1);
      return `${toAlias(np)}.${f}`;
    }
    case "binary": {
      return `(${filterToString(filter.lhs)} ${opToString(filter.operator)} ${filterToString(
        filter.rhs
      )})`;
    }
    case "variable": {
      return `$\{${filter.name}}`;
    }
  }
}

function opToString(op: BinaryOperator): string {
  switch (op) {
    case "is":
      return "=";
    default:
      return op.toUpperCase();
  }
}

function joinToString(def: Definition, join: Join): string {
  const model = getTargetModel(def, join.refKey);
  const joinMode = join.joinType === "inner" ? "JOIN" : "LEFT JOIN";
  return source`
  ${joinMode} ${model.dbname} AS ${toAlias(join.namePath)}
  ON ${filterToString(join.on)}
  ${join.joins.map((j) => joinToString(def, j))}`;
}

function queriableSelectAll(def: Definition, q: Queriable): string {
  const { value: model } = getRef<"model">(def, q.modelRefKey);
  const fieldSels = model.fields.map(
    (f) => `${toAlias([model.name])}.${f.dbname} AS ${toAlias([model.name, f.name])}`
  );
  const joinSels = q.joins.map((j) => joinSelectAll(def, j));
  return [...fieldSels, ...joinSels].join(",");
}

function joinSelectAll(def: Definition, j: Join): string {
  const model = getTargetModel(def, j.refKey);
  return model.fields
    .map((f) => `${toAlias(j.namePath)}.${f.dbname} AS ${toAlias([...j.namePath, f.name])}`)
    .join(",");
}

export function queriableToString(def: Definition, q: Queriable): string {
  const { value: model } = getRef<"model">(def, q.modelRefKey);
  return source`
    SELECT ${queriableSelectAll(def, q)}
    FROM ${model.dbname} as ${toAlias([model.name])}
    ${q.joins.map((j) => joinToString(def, j))}
    WHERE ${filterToString(q.filter)};
  `;
}

export function flattenEntrypoints(ep: EntrypointDef): EntrypointDef[] {
  return [ep, ...ep.entrypoints.flatMap((e) => flattenEntrypoints(e))];
}

type Mapping = {
  model: ModelDef;
  field: FieldDef;
  reference: ReferenceDef;
  relation: RelationDef;
  query: QueryDef;
  // [RefType.Computed]: ModelDef;
};

type Ref<T extends keyof Mapping> = { kind: T; value: Mapping[T] };
function getRef<T extends keyof Mapping>(definition: Definition, refKey: string): Ref<T> {
  const model = definition.models.find((m) => m.refKey === refKey);
  if (model) return { kind: "model", value: model } as Ref<T>;

  const field = definition.models.flatMap((m) => m.fields).find((f) => f.refKey === refKey);
  if (field) return { kind: "field", value: field } as Ref<T>;

  const reference = definition.models.flatMap((m) => m.references).find((r) => r.refKey === refKey);
  if (reference) return { kind: "reference", value: reference } as Ref<T>;

  const relation = definition.models.flatMap((m) => m.relations).find((r) => r.refKey === refKey);
  if (relation) return { kind: "relation", value: relation } as Ref<T>;

  const query = definition.models.flatMap((m) => m.queries).find((q) => q.refKey === refKey);
  if (query) return { kind: "query", value: query } as Ref<T>;

  throw new Error(`Unknown`);
}
