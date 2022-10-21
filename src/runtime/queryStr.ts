import { source } from "common-tags";
import _ from "lodash";

import { getRef, getTargetModel } from "@src/common/refs";
import { ensureEqual } from "@src/common/utils";
import { BinaryOperator } from "@src/types/ast";
import {
  Definition,
  FilterDef,
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
      FROM ${model.dbname} as ${toAlias([model.name])}
      ${q.joinPaths.map((j) => joinToString(def, j))}
      WHERE ${filterToString(q.filter)};`;
    }
    case "query":
      throw "todo";
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
    default:
      return op.toUpperCase();
  }
}

function joinToString(def: Definition, join: QueryDefPath): string {
  const model = getTargetModel(def.models, join.refKey);
  const joinNames = getJoinNames(def, join.refKey);
  const joinMode = join.joinType === "inner" ? "JOIN" : "LEFT JOIN";
  const joinFilter: FilterDef = {
    kind: "binary",
    operator: "is",
    lhs: { kind: "alias", namePath: [..._.initial(join.namePath), joinNames.that] },
    rhs: { kind: "alias", namePath: [...join.namePath, joinNames.this] },
  };
  return source`
  ${joinMode} ${model.dbname} AS ${toAlias(join.namePath)}
  ON ${filterToString(joinFilter)}
  ${join.joinPaths.map((j) => joinToString(def, j))}`;
}

function getJoinNames(def: Definition, refKey: string): { this: string; that: string } {
  const prop = getRef(def, refKey);
  switch (prop.kind) {
    case "reference": {
      const reference = prop.value;
      const { value: field } = getRef<"field">(def, reference.fieldRefKey);
      const { value: refField } = getRef<"field">(def, reference.toModelFieldRefKey);

      return { this: field.name, that: refField.name };
    }
    case "relation": {
      const relation = prop.value;
      const { value: reference } = getRef<"reference">(def, relation.throughRefKey);
      const { value: field } = getRef<"field">(def, reference.fieldRefKey);
      const { value: refField } = getRef<"field">(def, reference.toModelFieldRefKey);

      return { this: field.name, that: refField.name };
    }
    default:
      throw new Error(`Kind ${prop.kind} not supported`);
  }
}
