import { source } from "common-tags";
import _ from "lodash";

import { NamePath, getFilterPaths, selectToSelectable } from "./build";

import { getRef, getRef2, getTargetModel } from "@src/common/refs";
import { assertUnreachable } from "@src/common/utils";
import { getTypedPath } from "@src/composer/utils";
import {
  Definition,
  ModelDef,
  QueryDef,
  QueryDefPath,
  SelectComputedItem,
  SelectFieldItem,
  SelectableItem,
  TypedExprDef,
  TypedFunction,
} from "@src/types/definition";

// FIXME this should accept Queryable
export function queryToString(def: Definition, q: QueryDef): string {
  const deps = filterToSelectableDeps(def, q);
  switch (q.from.kind) {
    case "model": {
      const { value: model } = getRef<"model">(def, q.from.refKey);
      const selectable = selectToSelectable(q.select);
      return source`
      SELECT ${selectableToString(def, selectable)}
      FROM ${makeWrappedSource(def, model, selectable)} AS ${namePathToAlias([model.name])}
      ${q.joinPaths.map((j) => joinToString(def, j, deps))}
      WHERE ${filterToString(q.filter)}`;
    }
    case "query":
      return source`
      SELECT ${selectableToString(def, selectToSelectable(q.select))}
      FROM (${queryToString(def, q.from.query)}) AS ${namePathToAlias(q.from.query.fromPath)}
      ${q.joinPaths.map((j) => joinToString(def, j, deps))}
      WHERE ${filterToString(q.filter)}`;
  }
}

function filterToSelectableDeps(def: Definition, q: QueryDef): SelectableItem[] {
  const paths = getFilterPaths(q.filter);
  return paths.flatMap((path): SelectableItem => {
    const typedPath = getTypedPath(def, path, {});
    if (!typedPath.leaf) {
      // FIXME this should be possible, eg. for IN operator. Use getTypedPathWithLeaf to populate the IDs
      throw new Error(`Path not ending in a leaf`);
    }
    return {
      kind: typedPath.leaf.kind,
      refKey: typedPath.leaf.refKey,
      name: typedPath.leaf.name,
      alias: typedPath.leaf.name,
      namePath: path,
    };
  });
}

function makeWrappedSource(def: Definition, model: ModelDef, select: SelectableItem[]): string {
  /**
   * FIXME ensure all fields and computeds belong to this model!!!
   */
  // any computeds here?
  const isBareModel = select.filter((s) => s.kind === "computed").length === 0;
  if (isBareModel) {
    // no need to wrap, just source from a model
    return `"${model.dbname}"`;
  }
  // reorder selects by a resolve order
  const selectOrd = _.sortBy(select, [
    (i) => def.resolveOrder.findIndex((ref) => ref === i.refKey),
  ]);

  // wrap with the final one and source it recursively
  const wrapper = _.last(selectOrd) as SelectComputedItem; // it's a computed
  const remaining = _.initial(selectOrd);
  const source = makeWrappedSource(def, model, remaining);
  const computed = getRef2.computed(def, wrapper.refKey);
  // NOTE: we alias to `model.name` as that's what `computed.exp` is namespaced (`namePath`) with
  return `(SELECT "${model.name}".*, ${filterToString(computed.exp)} AS "${
    wrapper.alias
  }" FROM ${source} AS "${model.name}")`;
}

function selectableToString(def: Definition, select: SelectableItem[]): string {
  return select
    .map((item) => {
      switch (item.kind) {
        case "field": {
          const field = getRef2.field(def, item.refKey);
          return `${namePathToAlias(_.initial(item.namePath))}."${field.dbname}" AS "${
            item.alias
          }"`;
        }
        case "computed": {
          const computed = getRef2.computed(def, item.refKey);
          return filterToString(computed.exp);
        }
      }
    })
    .join(", ");
}

function namePathToAlias(namePath: NamePath): string {
  return `"${namePath.join(".")}"`;
}

function filterToString(filter: TypedExprDef): string {
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
        default:
          assertUnreachable(filter);
      }
    }
    // Due to bug in eslint/prettier, linter complains that `break` is expected in the case "literal"
    // Since inner switch is exaustive, break is unreachable so prettier deletes it
    // eslint-disable-next-line no-fallthrough
    case "alias": {
      const np = filter.namePath.slice(0, filter.namePath.length - 1);
      const f = filter.namePath.at(filter.namePath.length - 1);
      return `${namePathToAlias(np)}."${f}"`;
    }
    case "function": {
      return functionToString(filter);
    }
    case "variable": {
      return `:${filter.name}`;
    }
  }
}

function functionToString(exp: TypedFunction): string {
  function stringifyOp(lhs: TypedExprDef, rhs: TypedExprDef, op: string): string {
    return `${filterToString(lhs)} ${op.toUpperCase()} ${filterToString(rhs)}`;
  }
  function stringifyFn(name: string, args: TypedExprDef[]): string {
    return `${name}(${args.map((a) => filterToString(a)).join(", ")})`;
  }
  switch (exp.name) {
    case "<":
    case ">":
    case ">=":
    case "<=":
    case "/":
    case "*":
    case "in":
    case "not in":
    case "and": {
      return stringifyOp(exp.args[0], exp.args[1], exp.name);
    }
    case "+":
    case "-":
    case "or": {
      return `(${stringifyOp(exp.args[0], exp.args[1], exp.name)})`;
    }
    case "is": {
      return stringifyOp(exp.args[0], exp.args[1], "=");
    }
    case "is not": {
      return stringifyOp(exp.args[0], exp.args[1], "<>");
    }
    case "length": {
      return stringifyFn("char_length", exp.args);
    }
    case "concat": {
      return stringifyFn("concat", exp.args);
    }
    default:
      assertUnreachable(exp.name);
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

function extractRelevantDeps(deps: SelectableItem[], namePath: string[]): SelectableItem[] {
  // find deps EXACTLY matching the namePath
  return (
    deps
      // first, make sure `item.namePath` is correct length
      .filter((item) => item.namePath.length === namePath.length + 1)
      // make sure the path matches the namePath
      .filter((item) => _.isEqual(_.initial(item.namePath), namePath))
  );
}

function joinToString(def: Definition, join: QueryDefPath, deps: SelectableItem[]): string {
  const thisDeps = extractRelevantDeps(deps, join.namePath);
  const model = getTargetModel(def.models, join.refKey);
  const joinNames = getJoinNames(def, join.refKey);
  const joinMode = join.joinType === "inner" ? "JOIN" : "LEFT JOIN";
  const joinFilter: TypedExprDef = {
    kind: "function",
    name: "is",
    args: [
      { kind: "alias", namePath: [..._.initial(join.namePath), joinNames.from] },
      { kind: "alias", namePath: [...join.namePath, joinNames.to] },
    ],
  };

  let src: string;
  if (join.kind === "query") {
    const { value: query } = getRef<"query">(def, join.refKey);
    const sourceModel = getQuerySource(def, query);
    // extend select
    const conn = mkJoinConnection(sourceModel);

    // FIXME make sure to pass correct queries / filters / filterPath??
    src = source`(
      ${queryToString(def, { ...query, select: [...query.select, ...thisDeps, conn] })})`; // FIXME should remove query.select?
  } else {
    // we need to read the dependencies of this join! SelectPaths or something!
    src = makeWrappedSource(def, model, thisDeps);
  }

  return source`
  ${joinMode}
  ${src} AS ${namePathToAlias(join.namePath)}
  ON ${filterToString(joinFilter)}
  ${join.joinPaths.map((j) => joinToString(def, j, deps))}`;
}

export function mkJoinConnection(model: ModelDef): SelectFieldItem {
  return {
    kind: "field",
    refKey: `${model.name}.id`,
    alias: "__join_connection",
    name: "id",
    namePath: [model.name, "id"],
  };
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

      return { from: refField.name, to: field.name };
    }
    case "query": {
      return { from: "id", to: "__join_connection" };
    }
    default:
      throw new Error(`Kind ${prop.kind} not supported`);
  }
}
