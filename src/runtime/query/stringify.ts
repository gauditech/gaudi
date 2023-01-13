import { source } from "common-tags";
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
import { getTypedPath, getTypedPathWithLeaf } from "@src/composer/utils";
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
  const joinPlan = buildQueryJoinPlan(paths, false);
  const modelRef = getRef2(def, joinPlan.sourceModel, undefined, ["model"]);
  const model = modelRef.value;
  const selectable = selectToSelectable(q.select);
  const aggrSelects = joinPlan.selectable
    .map((s) => nameToSelectable(def, [model.refKey, s]))
    .filter((s): s is SelectAggregateItem => s.kind === "aggregate");

  const joins = joinPlan.joins.map((j) => joinToString(def, model, [model.name], j));
  const aggrJoins = aggrSelects.map((a) => makeAggregateJoin(def, a.namePath));
  const where = expandedFilter ? `WHERE ${expressionToString(def, expandedFilter)}` : "";

  const qstr = source`
      SELECT ${selectableToString(def, selectable)}
      FROM ${refToTableSqlFragment(def, modelRef)}
      AS ${namePathToAlias([model.name])}
      ${aggrJoins}
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

  const aggregateJoins = aggregates.map((a) => makeAggregateJoin(def, a.namePath));

  return source`
  ${join.scope.toUpperCase()}
  JOIN ${refToTableSqlFragment(def, ref)}
  AS ${namePathToAlias(namePath)}
  ON ${expressionToString(def, joinFilter)}
  ${aggregateJoins.join("\n")}
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
          return assertUnreachable(tpath.leaf);
        }
      }
    }
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

function buildQueryJoinPlan(paths: string[][], leftJoin: boolean): QueryJoinPlan {
  // Ensure all paths start with the same root and not empty!
  const roots = _.uniq(paths.map((p) => p[0]));
  ensureEqual(roots.length, 1);
  return {
    sourceModel: roots[0],
    selectable: getLeaves(paths, roots),
    joins: getJoins(paths, roots, leftJoin),
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

function getJoins(paths: string[][], namespace: string[], leftJoin: boolean): Join[] {
  // get nodes
  return getNodes(paths, namespace).map((node) => {
    const selectable = getLeaves(paths, [...namespace, node]);
    return {
      scope: leftJoin ? "left" : "",
      relname: node,
      selectable,
      joins: getJoins(paths, [...namespace, node], leftJoin),
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

function refToTableSqlFragment(
  def: Definition,
  ref: Ref<"model" | "reference" | "relation" | "query">
): string {
  const targetModel = getTargetModel(def.models, ref.value.refKey);

  // no need to wrap, just source from a model
  switch (ref.kind) {
    case "model":
    case "reference":
    case "relation": {
      return `"${targetModel.dbname}"`;
    }
    case "query": {
      const query = ref.value;
      const sourceModel = getRef2.model(def, ref.value.modelRefKey);
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
          ${queryToString(def, { ...query, select: [...fields, conn] })})`;
    }
    default: {
      assertUnreachable(ref);
    }
  }
}

function makeAggregateJoin(def: Definition, namePath: NamePath): string {
  const tpath = getTypedPath(def, namePath, {});
  ensureNot(tpath.leaf, null);
  const aggregate = getRef2.aggregate(def, tpath.leaf.refKey);

  return source`
  LEFT JOIN ${aggregateToString(def, aggregate)}
  AS ${namePathToAlias(namePath)}
  ON ${namePathToAlias(_.initial(namePath))}.id = ${namePathToAlias(namePath)}.id
  `;
}

function aggregateToString(def: Definition, aggregate: AggregateDef): string {
  const query = aggregate.query;
  const aggrTarget = getTypedPathWithLeaf(def, aggregate.targetPath, {});
  // FIXME target can be a computed, other aggregate, etc.
  const aggrField = getRef2.field(def, aggrTarget.leaf.refKey);

  const expandedFilter = expandExpression(def, query.filter);

  const paths = collectPaths(def, query);
  // FIXME get the aggregate target field namePath in it as well
  const joinPlan = buildQueryJoinPlan(paths, true);
  const modelRef = getRef2(def, joinPlan.sourceModel, undefined, ["model"]);
  const model = modelRef.value;
  const aggrSelects = joinPlan.selectable
    .map((s) => nameToSelectable(def, [model.refKey, s]))
    .filter((s): s is SelectAggregateItem => s.kind === "aggregate");

  const joins = joinPlan.joins.map((j) => joinToString(def, model, [model.name], j));
  const filterWhere = expandedFilter
    ? `FILTER(WHERE ${expressionToString(def, expandedFilter)})`
    : "";
  const aggrFieldExpr = `${namePathToAlias(aggregate.query.fromPath)}.${aggrField.dbname}`;
  const aggrJoins = aggrSelects.map((a) => makeAggregateJoin(def, a.namePath));

  const qstr = source`
  (SELECT
    ${namePathToAlias([model.name])}.id,
    ${aggregate.aggrFnName}(${aggrFieldExpr}) ${filterWhere} AS "result"
  FROM ${refToTableSqlFragment(def, modelRef)}
  AS ${namePathToAlias([model.name])}
  ${joins}
  ${aggrJoins}
  GROUP BY ${namePathToAlias([model.name])}.id)`;

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
          const expStr = expressionToString(
            def,
            transformExpressionPaths(exp, [computed.modelRefKey], _.initial(item.namePath))
          );
          return `${expStr} AS "${item.alias}"`;
        }
        case "aggregate": {
          // const aggregate = getRef2.aggregate(def, item.refKey);
          return `${namePathToAlias(item.namePath)}."result" AS "${item.alias}"`;
        }
      }
    })
    .join(", ");
}

function namePathToAlias(namePath: NamePath): string {
  return `"${namePath.join(".")}"`;
}

function expressionToString(def: Definition, filter: TypedExprDef): string {
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
          return assertUnreachable(filter);
      }
    }
    case "alias": {
      // We need to check if alias points to an aggregate so we can attach "result".
      // We try/catch because `__join_connection` appears in paths but is not resolved with `getTypedPath`.
      // We could check specifically for `__join_connection` but this is sufficient.
      try {
        const tpath = getTypedPath(def, filter.namePath, {});
        ensureNot(tpath.leaf, null);
        if (tpath.leaf.kind === "aggregate") {
          return `${namePathToAlias(filter.namePath)}."result"`;
        }
      } catch (_e) {
        // Just ignore the error and continue
      }
      const np = _.initial(filter.namePath);
      const f = _.last(filter.namePath);
      return `${namePathToAlias(np)}."${f}"`;
    }
    case "function": {
      return functionToString(def, filter);
    }
    case "variable": {
      // Start variable names with a `:` which is a knex format for query variables
      // Knex does interpolation on variables, taking care of SQL injection etc.
      return `:${filter.name}`;
    }
  }
}

function functionToString(def: Definition, exp: TypedFunction): string {
  function stringifyOp(lhs: TypedExprDef, rhs: TypedExprDef, op: string): string {
    return `${expressionToString(def, lhs)} ${op.toUpperCase()} ${expressionToString(def, rhs)}`;
  }
  function stringifyFn(name: string, args: TypedExprDef[]): string {
    return `${name}(${args.map((a) => expressionToString(def, a)).join(", ")})`;
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
