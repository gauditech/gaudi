import { source } from "common-tags";
import _ from "lodash";

import { getRef, getTargetModel } from "@src/common/refs";
import { ensureEqual } from "@src/common/utils";
import { BinaryOperator } from "@src/types/ast";
import {
  Definition,
  EndpointDef,
  FilterDef,
  ReferenceDef,
  RelationDef,
  SelectConstantItem,
  SelectDef,
  SelectFieldItem,
  SelectableItem,
  TargetDef,
} from "@src/types/definition";

export function selectToSelectable(select: SelectDef): SelectableItem[] {
  return select.filter((s): s is SelectableItem => s.kind === "field" || s.kind === "constant");
}

type Queryable = {
  modelRefKey: string;
  joins: Join[];
  filter: FilterDef;
  select: SelectableItem[];
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

export function buildEndpointContextSql(def: Definition, endpoint: EndpointDef): string | null {
  const exists: SelectConstantItem = {
    kind: "constant",
    type: "integer",
    value: 1,
    alias: "exists",
  };
  switch (endpoint.kind) {
    case "create":
    case "list": {
      const q = queryableFromEndpointTargets(def, _.initial(endpoint.targets), [exists], "multi");
      return q && queryableToString(def, q);
    }
    case "get":
    case "update": {
      const fields = endpoint.response.filter((s): s is SelectFieldItem => s.kind === "field");
      return buildEndpointTargetSql(def, endpoint.targets, fields, "single");
    }
    case "delete": {
      return buildEndpointTargetSql(def, endpoint.targets, [exists], "single");
    }
  }
}

export function buildEndpointTargetSql(
  def: Definition,
  targets: TargetDef[],
  select: SelectableItem[],
  mode: "single" | "multi"
): string {
  const q = queryableFromEndpointTargets(def, targets, select, mode);
  if (!q) {
    throw new Error(`Unable to build queryable record! Check targets.`);
  }
  return queryableToString(def, q);
}

// export buildSqlFromTargets()

export function queryableFromEndpointTargets(
  def: Definition,
  targets: TargetDef[],
  select: SelectableItem[],
  mode: "single" | "multi"
): Queryable | null {
  if (!targets.length) return null;
  const [target, ...rest] = targets;
  const shouldFilterByIdentity = rest.length > 0 || mode === "single";
  return {
    modelRefKey: target.refKey,
    filter: shouldFilterByIdentity
      ? {
          kind: "binary",
          operator: "is",
          lhs: { kind: "alias", namePath: [target.name, target.identifyWith.name] },
          rhs: {
            kind: "variable",
            type: target.identifyWith.type,
            name: target.identifyWith.paramName,
          },
        }
      : undefined,
    joins: queryableJoins(def, rest, [target.name], mode),
    select,
  };
}

export type PathParam = { path: string; params: { name: string; type: "integer" | "text" }[] };

export function buildEndpointPath(endpoint: EndpointDef): PathParam {
  const pairs = endpoint.targets.map((target) => ({
    name: target.name.toLowerCase(),
    param: { name: target.identifyWith.paramName, type: target.identifyWith.type },
  }));
  switch (endpoint.kind) {
    case "get":
    case "update":
    case "delete":
      return {
        path: [
          "", // add leading slash
          ...pairs.map(({ name, param }) => [name, `:${param.name}`].join("/")),
        ].join("/"),
        params: pairs.map(({ param }) => param),
      };
    case "list":
    case "create":
      return {
        path: [
          "", // add leading slash
          ...pairs
            .slice(0, pairs.length - 1)
            .map(({ name, param }) => [name, `:${param.name}`].join("/")),
          pairs[pairs.length - 1].name,
        ].join("/"),
        params: pairs.slice(0, pairs.length - 1).map(({ param }) => param),
      };
  }
}
function queryableJoins(
  def: Definition,
  targets: TargetDef[],
  parentNamePath: string[],
  mode: "single" | "multi"
): Join[] {
  if (!targets.length) return [];
  const [target, ...rest] = targets;
  if (target.kind === "model") throw new Error(`Cannot join with models!`);
  const namePath = [...parentNamePath, target.name];
  const joinNames = getJoinNames(def, target.refKey);
  const shouldFilterByIdentity = rest.length > 0 || mode === "single";

  const joinFilter: FilterDef = {
    kind: "binary",
    operator: "is",
    lhs: { kind: "alias", namePath: [...parentNamePath, joinNames.that] },
    rhs: { kind: "alias", namePath: [...namePath, joinNames.this] },
  };
  const onFilter: FilterDef = shouldFilterByIdentity
    ? {
        kind: "binary",
        operator: "and",
        lhs: joinFilter,
        rhs: {
          kind: "binary",
          operator: "is",
          lhs: { kind: "alias", namePath: [...namePath, target.identifyWith.name] },
          rhs: {
            kind: "variable",
            type: target.identifyWith.type,
            name: target.identifyWith.paramName,
          },
        },
      }
    : joinFilter;

  return [
    {
      name: target.name,
      refKey: target.refKey,
      namePath,
      kind: target.kind,
      joinType: "inner",
      on: onFilter,
      joins: queryableJoins(def, rest, namePath, mode),
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
      return `:${filter.name}`;
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

function selectToString(def: Definition, select: SelectableItem[]) {
  return select
    .map((item) => {
      switch (item.kind) {
        case "field": {
          const { value: field } = getRef<"field">(def, item.refKey);
          return `${toAlias(_.initial(item.namePath))}.${field.dbname} AS ${item.alias}`;
        }
        case "constant": {
          // FIXME security issue, this is not an escaped value!!
          ensureEqual(item.type, "integer");
          return `${item.value} AS "${item.alias}"`;
        }
      }
    })
    .join(", ");
}

export function queryableToString(def: Definition, q: Queryable): string {
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

function _queryableSelectAll(def: Definition, q: Queryable): string {
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
