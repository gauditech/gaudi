import { source } from "common-tags";
import _ from "lodash";

import { buildEndpointPath } from "./renderer/templates/server/endpoints.tpl";

import { getRef, getTargetModel } from "@src/common/refs";
import { BinaryOperator } from "@src/types/ast";
import {
  Definition,
  EndpointDef,
  FilterDef,
  ReferenceDef,
  RelationDef,
  SelectDef,
  TargetDef,
} from "@src/types/definition";

type Queriable = {
  modelRefKey: string;
  joins: Join[];
  filter: FilterDef;
  select: SelectDef;
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

type TargetWithVar = [TargetDef, string | undefined];

export function buildEndpointTargetsSQL(def: Definition, endpoint: EndpointDef): string {
  const q = queryableFromEndpointTargets(def, endpoint);
  return queriableToString(def, q);
}

export function queryableFromEndpointTargets(def: Definition, endpoint: EndpointDef): Queriable {
  const pathParam = buildEndpointPath(endpoint);
  const inputs = _.zip(
    endpoint.targets,
    pathParam.params.map((p) => p.name)
  ) as TargetWithVar[];
  const [[target, varName], ...rest] = inputs;
  const select = endpoint.response?.filter((s) => s.kind === "field") ?? [];

  return {
    modelRefKey: target.refKey,
    filter: varName
      ? {
          kind: "binary",
          operator: "is",
          lhs: { kind: "alias", namePath: [target.name, target.identifyWith.name] },
          rhs: {
            kind: "variable",
            type: target.identifyWith.type,
            name: varName,
          },
        }
      : undefined,
    joins: queriableJoins(def, rest, [target.name]).map((j) => forceLeftJoins(j)),
    select,
  };
}

function forceLeftJoins(j: Join): Join {
  return { ...j, joinType: "left", joins: j.joins.map((j) => forceLeftJoins(j)) };
}

function queriableJoins(
  def: Definition,
  inputs: TargetWithVar[],
  parentNamePath: string[]
): Join[] {
  if (!inputs.length) return [];
  const [[target, varName], ...rest] = inputs;
  if (target.kind === "model") throw new Error(`Cannot join with models!`);
  const namePath = [...parentNamePath, target.name];

  const joinNames = getJoinNames(def, target.refKey);

  return [
    {
      name: target.name,
      refKey: target.refKey,
      namePath,
      kind: target.kind,
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
              lhs: { kind: "alias", namePath: [...namePath, target.identifyWith.name] },
              rhs: {
                kind: "variable",
                type: target.identifyWith.type,
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
  const prop = getRef(def, refKey);
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
  const model = getTargetModel(def.models, join.refKey);
  const joinMode = join.joinType === "inner" ? "JOIN" : "LEFT JOIN";
  return source`
  ${joinMode} ${model.dbname} AS ${toAlias(join.namePath)}
  ON ${filterToString(join.on)}
  ${join.joins.map((j) => joinToString(def, j))}`;
}

function selectToString(def: Definition, select: SelectDef) {
  return select
    .map((item) => {
      if (item.kind !== "field") throw new Error(`Only fields can be selected`);
      const { value: field } = getRef<"field">(def, item.refKey);
      return `${toAlias(_.initial(item.namePath))}.${field.dbname} AS ${item.alias}`;
    })
    .join(", ");
}

export function queriableToString(def: Definition, q: Queriable): string {
  const { value: model } = getRef<"model">(def, q.modelRefKey);
  return source`
    SELECT ${selectToString(def, q.select)}
    FROM ${model.dbname} as ${toAlias([model.name])}
    ${q.joins.map((j) => joinToString(def, j))}
    WHERE ${filterToString(q.filter)};
  `;
}

/*
-- Unused functions, but may be used for dev/testing/debugging.
 */

function _queriableSelectAll(def: Definition, q: Queriable): string {
  const { value: model } = getRef<"model">(def, q.modelRefKey);
  const fieldSels = model.fields.map(
    (f) => `${toAlias([model.name])}.${f.dbname} AS ${toAlias([model.name, f.name])}`
  );
  const joinSels = q.joins.map((j) => _joinSelectAll(def, j));
  return [...fieldSels, ...joinSels].join(",");
}

function _joinSelectAll(def: Definition, j: Join): string {
  const model = getTargetModel(def.models, j.refKey);
  return model.fields
    .map((f) => `${toAlias(j.namePath)}.${f.dbname} AS ${toAlias([...j.namePath, f.name])}`)
    .join(",");
}
