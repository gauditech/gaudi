import _ from "lodash";
import { format } from "sql-formatter";

import {
  NamePath,
  selectToSelectable,
  transformExpressionPaths,
  transformNamePaths,
  uniqueNamePaths,
} from "./build";

import { Ref, getRef, getRef2, getTargetModel } from "@src/common/refs";
import { assertUnreachable, ensureEqual, ensureNot } from "@src/common/utils";
import { getTypedPath } from "@src/composer/utils";
import {
  AggregateDef,
  Definition,
  ModelDef,
  QueryDef,
  SelectAggregateItem,
  SelectComputedItem,
  SelectFieldItem,
  SelectableItem,
  TypedExprDef,
  TypedFunction,
} from "@src/types/definition";

// FIXME this should accept Queryable
export function queryToString(def: Definition, q: QueryDef): string {
  const expandedFilter = expandExpression(def, q.filter);

  const paths = collectPaths(def, q);
  const joinPlan = buildQueryJoinPlan(paths);
  const modelRef = getRef2(def, joinPlan.sourceModel, undefined, ["model"]);
  const model = modelRef.value;
  const selectable = selectToSelectable(q.select);
  const aggrSelects = joinPlan.selectable
    .map((s) => nameToSelectable(def, [model.refKey, s]))
    .filter((s): s is SelectAggregateItem => s.kind === "aggregate");

  const joins = joinPlan.joins.map((j) => joinToString(def, model, [model.refKey], j));
  const where = expandedFilter ? `WHERE ${filterToString(expandedFilter)}` : "";

  const qstr = `
      SELECT ${selectableToString(def, selectable)}
      FROM ${makeWrappedSource(def, modelRef, aggrSelects, [model.refKey])}
      ${joins}
      ${where}`;

  return format(qstr, { paramTypes: { named: [":", ":@" as any] }, language: "postgresql" });
}

function joinToString(
  def: Definition,
  sourceModel: ModelDef,
  sourceNamePath: string[],
  join: Join
): string {
  const namePath = [...sourceNamePath, join.relname];
  const ref = getRef2(def, sourceModel.refKey, join.relname, ["reference", "relation", "query"]);
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
  const aggregates = thisDeps.filter((d): d is SelectAggregateItem => d.kind === "aggregate");

  return `
  ${join.scope.toUpperCase()}
  JOIN ${makeWrappedSource(def, ref, aggregates, namePath, joinFilter)}
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
        case "aggregate":
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
export function nameToSelectable(def: Definition, namePath: string[]): SelectableItem {
  const typedPath = getTypedPath(def, namePath, {});
  ensureNot(typedPath.leaf, null);
  const ref = getRef2(def, typedPath.leaf.refKey, undefined, ["field", "computed", "aggregate"]);
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
function collectPaths(def: Definition, q: QueryDef | AggregateDef["query"]): string[][] {
  // FIXME this is not how it should work!!
  const selectables = "select" in q ? selectToSelectable(q.select) : [];
  const computeds = selectables.filter(
    (item): item is SelectComputedItem => item.kind === "computed"
  );
  const aggregates = selectables.filter(
    (item): item is SelectAggregateItem => item.kind === "aggregate"
  );
  const allPaths = [
    [...q.fromPath, "id"],
    ...collectPathsFromExp(def, expandExpression(def, q.filter)),
    // We only take root-level select - `Selectable`.
    // FIXME is computed still considered selectable? Do we need expressable here?
    // FIXME include aggregates here as well, they need to be in the paths so that
    // we know what to wrap with
    // QueryDef should have "aggregates" in the Join Plan (which are the "Wraps")
    ...computeds.flatMap((item) => {
      const computed = getRef2.computed(def, item.refKey);

      const expandedExpression = expandExpression(def, computed.exp);
      const newExp = transformExpressionPaths(
        expandedExpression,
        [computed.modelRefKey],
        _.initial(item.namePath)
      );
      return collectPathsFromExp(def, newExp);
    }),
    ...aggregates.map((a) => a.namePath),
  ];
  return uniqueNamePaths(allPaths);
}

type QueryJoinPlan = {
  sourceModel: string;
  selectable: string[];
  joins: Join[];
};

type Join = {
  scope: "left" | "";
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
      scope: "",
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
      if (typedPath.leaf.kind === "field" || typedPath.leaf.kind === "aggregate") {
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

function makeWrappedSource(
  def: Definition,
  ref: Ref<"model" | "reference" | "relation" | "query">,
  aggrSelects: SelectAggregateItem[],
  namePath: NamePath,
  on?: TypedExprDef
): string {
  // returns: fragment, alias, retType

  // FIXME `model` handling is awkward currently
  const isModel = ref.kind === "model";
  const sourceModel = isModel ? ref.value : getRef2.model(def, ref.value.modelRefKey);
  const targetModel = isModel ? ref.value : getTargetModel(def.models, ref.value.refKey);

  if (_.isEmpty(aggrSelects)) {
    const onStr = on ? `ON ${filterToString(on)}` : "";
    // no need to wrap, just source from a model
    switch (ref.kind) {
      case "model":
      case "reference":
      case "relation": {
        return `"${targetModel.dbname}" AS ${namePathToAlias(namePath)} ${onStr}`;
      }
      case "query": {
        const query = ref.value;
        const conn = mkJoinConnection(sourceModel);
        // FIXME take only the fields needed, not all of them!
        const fields = targetModel.fields.map(
          (f): SelectFieldItem => ({
            kind: "field",
            refKey: f.refKey,
            name: f.name,
            alias: f.name,
            namePath: [...query.fromPath, f.name],
          })
        );
        return `(
          ${queryToString(def, { ...query, select: [...fields, conn] })})
          AS ${namePathToAlias(namePath)}
          ${onStr}`;
      }
    }
  }

  // wrap with the final one and source it recursively

  const [wrapper, ...remaining] = aggrSelects;
  const source = makeWrappedSource(def, ref, remaining, namePath, on);
  const aggregate = getRef2.aggregate(def, wrapper.refKey);

  // `remaining` are already wrapped

  // FIXME we should also be able to join to get correct aggregates, for example
  // when you're counting a nested field; such as `count { parent.foo }`

  return `
  ${source}
  LEFT JOIN
    ${aggregateToString(def, aggregate)}
    AS ${namePathToAlias([...namePath, aggregate.name])}
  ON ${namePathToAlias(namePath)}.id = ${namePathToAlias([...namePath, aggregate.name])}.id
  `;
}

function aggregateToString(def: Definition, aggregate: AggregateDef): string {
  const query = aggregate.query;
  const aggrField = getRef2.field(def, aggregate.aggrFieldRefKey);

  const expandedFilter = expandExpression(def, query.filter);

  const paths = collectPaths(def, query);
  const joinPlan = buildQueryJoinPlan(paths);
  const modelRef = getRef2(def, joinPlan.sourceModel, undefined, ["model"]);
  const model = modelRef.value;
  const aggrSelects = joinPlan.selectable
    .map((s) => nameToSelectable(def, [model.refKey, s]))
    .filter((s): s is SelectAggregateItem => s.kind === "aggregate");

  const joins = joinPlan.joins.map((j) => joinToString(def, model, [model.refKey], j));
  const source = makeWrappedSource(def, modelRef, aggrSelects, [model.refKey]);
  const where = expandedFilter ? `WHERE ${filterToString(expandedFilter)}` : "";
  const aggrFieldExpr = `${namePathToAlias(aggregate.query.fromPath)}.${aggrField.dbname}`;
  const qstr = `
  (SELECT
    ${namePathToAlias([model.refKey])}.id,
    ${aggregate.aggrFnName}(${aggrFieldExpr}) AS "result"
  FROM ${source}
  ${joins}
  ${where}
  GROUP BY ${namePathToAlias([model.refKey])}.id)`;

  return format(qstr, { language: "postgresql" });
}

function selectableToString(def: Definition, select: SelectableItem[]): string {
  return select
    .map((item): string => {
      switch (item.kind) {
        case "field": {
          const field = getRef2.field(def, item.refKey);
          return `${namePathToAlias(_.initial(item.namePath))}."${field.dbname}" AS "${
            item.alias
          }"`;
        }
        case "computed": {
          const computed = getRef2.computed(def, item.refKey);
          const exp = expandExpression(def, computed.exp);
          const expStr = filterToString(
            transformExpressionPaths(exp, [computed.modelRefKey], _.initial(item.namePath))
          );
          return `${expStr} AS "${item.alias}"`;
        }
        case "aggregate": {
          // const aggregate = getRef2.aggregate(def, item.refKey);
          return `${namePathToAlias([...item.namePath])}."result" AS "${item.alias}"`;
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
  const ref = getRef(def, refKey);
  switch (ref.kind) {
    case "reference": {
      const reference = ref.value;
      const { value: field } = getRef<"field">(def, reference.fieldRefKey);
      const { value: refField } = getRef<"field">(def, reference.toModelFieldRefKey);

      return { from: field.name, to: refField.name };
    }
    case "relation": {
      const relation = ref.value;
      const { value: reference } = getRef<"reference">(def, relation.throughRefKey);
      const { value: field } = getRef<"field">(def, reference.fieldRefKey);
      const { value: refField } = getRef<"field">(def, reference.toModelFieldRefKey);

      return { from: refField.name, to: field.name };
    }
    case "query": {
      return { from: "id", to: "__join_connection" };
    }
    default:
      throw new Error(`Kind ${ref.kind} not supported`);
  }
}
