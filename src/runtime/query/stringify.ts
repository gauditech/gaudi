import _ from "lodash";
import { format } from "sql-formatter";

import {
  NamePath,
  selectToSelectable,
  transformExpressionPaths,
  transformNamePaths,
} from "./build";

import { getRef, getRef2, getTargetModel } from "@src/common/refs";
import { assertUnreachable, ensureEqual, ensureNot } from "@src/common/utils";
import { getTypedPath } from "@src/composer/utils";
import {
  Definition,
  ModelDef,
  QueryDef,
  SelectComputedItem,
  SelectFieldItem,
  SelectableItem,
  TypedExprDef,
  TypedFunction,
} from "@src/types/definition";

// FIXME this should accept Queryable
export function queryToString(def: Definition, q: QueryDef): string {
  // FIXME We currently don't support querying from QueryDef!
  ensureEqual(q.from.kind, "model" as const);

  const expandedFilter = expandExpression(def, q.filter);

  const paths = collectPaths(def, q);
  const joinPlan = buildQueryJoinPlan(paths);
  const model = getRef2.model(def, joinPlan.sourceModel);
  const selectable = selectToSelectable(q.select);
  const fromSelectables = joinPlan.selectable.map((s) => nameToSelectable(def, [model.refKey, s]));

  const qstr = `
      SELECT ${selectableToString(def, selectable)}
      FROM ${makeWrappedSource(def, model, fromSelectables)} AS ${namePathToAlias([model.refKey])}
      ${joinPlan.joins.map((j) => joinToString(def, model, [model.refKey], j))}
      WHERE ${filterToString(expandedFilter)}`;

  return format(qstr, { paramTypes: { named: [":", ":@" as any] }, language: "postgresql" });
}

function joinToString(
  def: Definition,
  sourceModel: ModelDef,
  sourceNamePath: string[],
  join: Join
): string {
  const namePath = [...sourceNamePath, join.relname];
  const ref = getRef2(def, sourceModel.refKey, join.relname);
  const model = getTargetModel(def.models, ref.value.refKey);
  const joinNames = getJoinNames(def, ref.value.refKey);
  const joinFilter: TypedExprDef = {
    kind: "function",
    name: "is",
    args: [
      { kind: "alias", namePath: [..._.initial(namePath), joinNames.from] },
      { kind: "alias", namePath: [...namePath, joinNames.to] },
    ],
  };

  const thisDeps = join.selectable.map((name) => nameToSelectable(def, [...namePath, name]));
  let src: string;
  if (ref.kind === "query") {
    const query = ref.value;
    const sourceModel = getQuerySource(def, query);
    // extend select
    const conn = mkJoinConnection(sourceModel);

    src = `(
      ${queryToString(def, { ...query, select: [...thisDeps, conn] })})`;
  } else {
    // we need to read the dependencies of this join! SelectPaths or something!
    src = makeWrappedSource(def, model, thisDeps);
  }

  return `
    JOIN ${src} AS ${namePathToAlias(namePath)}
    ON ${filterToString(joinFilter)}
    ${join.joins.map((j) => joinToString(def, model, namePath, j))}
  `;
}

/**
 * Expands computeds in the expression to build an expression consisting only
 * of fields.
 */
function expandExpression(def: Definition, exp: TypedExprDef): TypedExprDef {
  if (exp === undefined) {
    return undefined;
  }
  switch (exp.kind) {
    case "literal":
    case "variable":
      return exp;
    case "alias": {
      const tpath = getTypedPath(def, exp.namePath, {});
      ensureNot(tpath.leaf, null);
      switch (tpath.leaf.kind) {
        case "field": {
          return exp;
        }
        case "computed": {
          const computed = getRef2.computed(def, tpath.leaf.refKey);
          const newExp = expandExpression(def, computed.exp);
          return transformExpressionPaths(newExp, [computed.modelRefKey], _.initial(exp.namePath));
        }
        default: {
          assertUnreachable(tpath.leaf);
        }
      }
    }
    // eslint-disable-next-line no-fallthrough
    case "function": {
      return {
        ...exp,
        args: exp.args.map((arg) => expandExpression(def, arg)),
      };
    }
    default: {
      assertUnreachable(exp);
    }
  }
}

/** this should go together with the join plan */
function nameToSelectable(def: Definition, namePath: string[]): SelectableItem {
  const typedPath = getTypedPath(def, namePath, {});
  ensureNot(typedPath.leaf, null);
  const ref = getRef2(def, typedPath.leaf.refKey, undefined, ["field", "computed"]);
  const name = typedPath.leaf.name;
  return {
    kind: ref.kind,
    refKey: ref.value.refKey,
    name,
    alias: name,
    namePath,
  };
}

/**
 * Collects all the paths from `QueryDef.filter` and `QueryDef.select` that are needed
 * for a query to evaluate. This will turn in a list of joins needed for a query to
 * evaluate.
 */
function collectPaths(def: Definition, q: QueryDef): string[][] {
  const allPaths = [
    [...q.fromPath, "id"],
    ...collectPathsFromExp(def, q.filter),
    // We only take root-level select - `Selectable`.
    // FIXME is computed still considered selectable? Do we need expressable here?
    // FIXME include aggregates here as well, they need to be in the paths so that
    // we know what to wrap with
    // QueryDef should have "aggregates" in the Join Plan (which are the "Wraps")
    ...selectToSelectable(q.select)
      .filter((item): item is SelectComputedItem => item.kind === "computed")
      .flatMap((item) => {
        const computed = getRef2.computed(def, item.refKey);
        return collectPathsFromExp(def, computed.exp);
      }),
  ];
  return _.uniqWith(allPaths, _.isEqual);
}

type QueryJoinPlan = {
  sourceModel: string;
  selectable: string[];
  joins: Join[];
};

type Join = {
  relname: string;
  selectable: string[];
  joins: Join[];
};

function buildQueryJoinPlan(paths: string[][]): QueryJoinPlan {
  // Ensure all paths start with the same root and not empty!
  const roots = _.uniq(paths.map((p) => p[0]));
  ensureEqual(roots.length, 1);
  return {
    sourceModel: roots[0],
    selectable: getLeaves(paths, roots),
    joins: getJoins(paths, roots),
  };
}

function getLeaves(paths: string[][], namespace: string[]): string[] {
  return (
    paths
      // ensure equal namepath
      .filter((p) => _.isEqual(_.initial(p), namespace))
      .map((p) => _.last(p)!)
  );
}

function getNodes(paths: string[][], namespace: string[]): string[] {
  return (
    _.chain(paths)
      // make sure namespace matches
      .filter((p) => _.isEqual(_.take(p, namespace.length), namespace))
      // make sure it's not a leaf
      .filter((p) => p.length > namespace.length + 1)
      .map((p) => p[namespace.length])
      .uniq()
      .value()
  );
}

function getJoins(paths: string[][], namespace: string[]): Join[] {
  // get nodes
  return getNodes(paths, namespace).map((node) => {
    const selectable = getLeaves(paths, [...namespace, node]);
    return {
      relname: node,
      selectable,
      joins: getJoins(paths, [...namespace, node]),
    };
  });
}

export function collectPathsFromExp(def: Definition, exp: TypedExprDef): string[][] {
  if (exp === undefined) {
    return [];
  }

  switch (exp.kind) {
    case "literal":
    case "variable":
      return [];
    case "alias": {
      const typedPath = getTypedPath(def, exp.namePath, {});
      ensureNot(typedPath.leaf, null);
      if (typedPath.leaf.kind === "field") {
        return [exp.namePath];
      } else if (typedPath.leaf.kind === "computed") {
        const computed = getRef2.computed(def, typedPath.leaf.refKey);
        const computedInnerPaths = collectPathsFromExp(def, computed.exp);
        const computedPaths = transformNamePaths(
          computedInnerPaths,
          [computed.modelRefKey],
          _.initial(exp.namePath)
        );
        return [exp.namePath, ...computedPaths];
      } else {
        return assertUnreachable(typedPath.leaf);
      }
    }
    case "function": {
      return exp.args.flatMap((arg) => collectPathsFromExp(def, arg));
    }
  }
}

function makeWrappedSource(def: Definition, model: ModelDef, select: SelectableItem[]): string {
  /**
   * FIXME We don't use this for computeds anymore, but will be useful for the aggregates!
   */
  // const isBareModel = select.filter((s) => s.kind === "computed").length === 0;
  const isBareModel = true;
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
