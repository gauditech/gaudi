import { source } from "common-tags";
import _ from "lodash";

import { getRef, getTargetModel } from "@src/common/refs";
import { ensureEqual } from "@src/common/utils";
import { BinaryOperator } from "@src/types/ast";
import {
  Definition,
  FilterDef,
  ModelDef,
  QueryDef,
  QueryDefPath,
  SelectableItem,
} from "@src/types/definition";

export function queryToString(def: Definition, q: QueryDef): string {
  switch (q.from.kind) {
    case "model": {
      const { value: model } = getRef<"model">(def, q.from.refKey);
      return source`
      SELECT ${selectToString(def, q.select)}
      FROM "${model.dbname}" AS ${toAlias([model.name])}
      ${q.joinPaths.map((j) => joinToString(def, j))}
      WHERE ${filterToString(q.filter)}`;
    }
    case "query":
      return source`
      SELECT ${selectToString(def, q.select)}
      FROM (${queryToString(def, q.from.query)}) AS ${toAlias(q.from.query.fromPath)}
      ${q.joinPaths.map((j) => joinToString(def, j))}
      WHERE ${filterToString(q.filter)}`;
  }
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

function toAlias(np: string[]): string {
  return `"${np.join(".")}"`;
}

function filterToString(filter: FilterDef): string {
  if (filter === undefined) return "TRUE = TRUE";
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
      const fstr = `${filterToString(filter.lhs)} ${opToString(filter.operator)} ${filterToString(
        filter.rhs
      )}`;
      if (filter.operator === "or") {
        return `(${fstr})`;
      }
      return fstr;
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
    case "is not":
      return "<>";
    default:
      return op.toUpperCase();
  }
}

function getQuerySource(def: Definition, q: QueryDef): ModelDef {
  switch (q.from.kind) {
    case "model":
      return getRef<"model">(def, q.from.refKey).value;
    case "query": {
      return getQuerySource(def, q.from.query);
    }
  }
}

function joinToString(def: Definition, join: QueryDefPath): string {
  const model = getTargetModel(def.models, join.refKey);
  const joinNames = getJoinNames(def, join.refKey);
  const joinMode = join.joinType === "inner" ? "JOIN" : "LEFT JOIN";
  const joinFilter: FilterDef = {
    kind: "binary",
    operator: "is",
    lhs: { kind: "alias", namePath: [..._.initial(join.namePath), joinNames.from] },
    rhs: { kind: "alias", namePath: [...join.namePath, joinNames.to] },
  };

  let src: string;
  if (join.kind === "query") {
    const { value: query } = getRef<"query">(def, join.refKey);
    const sourceModel = getQuerySource(def, query);
    // extend select
    const conn: SelectableItem = {
      kind: "field",
      refKey: `${sourceModel.name}.id`,
      alias: '"__join_connection"',
      name: "id",
      namePath: [sourceModel.name, "id"],
    };
    const retModel = getRef<"model">(def, query.retType).value;
    const fields = retModel.fields.map(
      (f): SelectableItem => ({
        kind: "field",
        refKey: f.refKey,
        alias: f.name,
        name: f.name,
        namePath: [...query.fromPath, f.name],
      })
    );
    src = source`(
      ${queryToString(def, { ...query, select: [...query.select, ...fields, conn] })})`; // FIXME should remove query.select?
  } else {
    src = `"${model.dbname}"`;
  }

  return source`
  ${joinMode}
  ${src} AS ${toAlias(join.namePath)}
  ON ${filterToString(joinFilter)}
  ${join.joinPaths.map((j) => joinToString(def, j))}`;
}

function getJoinNames(def: Definition, refKey: string): { from: string; to: string } {
  const prop = getRef(def, refKey);
  switch (prop.kind) {
    case "reference": {
      const reference = prop.value;
      const { value: field } = getRef<"field">(def, reference.fieldRefKey);
      const { value: refField } = getRef<"field">(def, reference.toModelFieldRefKey);

      return { from: field.name, to: refField.name };
    }
    case "relation": {
      const relation = prop.value;
      const { value: reference } = getRef<"reference">(def, relation.throughRefKey);
      const { value: field } = getRef<"field">(def, reference.fieldRefKey);
      const { value: refField } = getRef<"field">(def, reference.toModelFieldRefKey);

      return { to: field.name, from: refField.name };
    }
    case "query": {
      return { to: '"__join_connection"', from: "id" };
    }
    default:
      throw new Error(`Kind ${prop.kind} not supported`);
  }
}
