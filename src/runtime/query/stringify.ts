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

import { getRef, getTargetModel } from "@src/common/refs";
import { assertUnreachable, ensureEqual, ensureNot } from "@src/common/utils";
import { getTypedPath, getTypedPathWithLeaf } from "@src/composer/utils";
import {
  AggregateDef,
  Definition,
  ModelDef,
  QueryDef,
  QueryOrderByAtomDef,
  ReferenceDef,
  RelationDef,
  SelectAggregateItem,
  SelectComputedItem,
  SelectFieldItem,
  SelectableItem,
  TypedExprDef,
  TypedFunction,
} from "@src/types/definition";

// FIXME this should accept Queryable
export function queryToString(def: Definition, q: QueryDef, isBatching = false): string {
  const expandedFilter = expandExpression(def, q.filter);

  const paths = collectPaths(def, q);
  const joinPlan = buildQueryJoinPlan(paths, false);
  const model = getRef(def, joinPlan.sourceModel, undefined, ["model"]);

  const selectable = selectToSelectable(q.select);
  const aggrSelects = joinPlan.selectable
    .map((s) => nameToSelectable(def, [model.refKey, s]))
    .filter((s): s is SelectAggregateItem => s.kind === "aggregate");

  function hasBatchingExpr(exp: TypedExprDef): boolean {
    if (exp === undefined) {
      return false;
    }
    switch (exp.kind) {
      case "alias":
      case "literal": {
        return false;
      }
      case "variable": {
        return exp.name === "@context_ids";
      }
      case "function": {
        // returns `true` if any of the args is `true`
        return exp.args.map((a) => hasBatchingExpr(a)).some(_.identity);
      }
    }
  }
  const innerBatching = hasBatchingExpr(q.filter);

  const joins = joinPlan.joins.map((j) => joinToString(def, model, [model.name], j, innerBatching));
  const aggrJoins = aggrSelects.map((a) => makeAggregateJoin(def, a.namePath));
  const where = expandedFilter ? `WHERE ${expressionToString(def, expandedFilter)}` : "";

  const offset = q.offset ?? 0;
  if (q.limit && isBatching) {
    return source`
    SELECT * FROM 
      (SELECT ${selectableToString(def, selectable)},
        ROW_NUMBER() OVER ( PARTITION BY "${model.name}"."id" ${orderByToString(
      def,
      q.orderBy
    )}) AS "__row_number"
        FROM ${refToTableSqlFragment(def, model, innerBatching)}
        AS ${namePathToAlias([model.name])}
        ${aggrJoins}
        ${joins}
        ${where}) as topn
    WHERE topn."__row_number" <= ${q.limit + offset} AND topn."__row_number" > ${offset}
    `;
  } else {
    const qstr = source`
      SELECT ${selectableToString(def, selectable)}
      FROM ${refToTableSqlFragment(def, model, innerBatching)}
      AS ${namePathToAlias([model.name])}
      ${aggrJoins}
      ${joins}
      ${where}
      ${orderByToString(def, q.orderBy)}
      ${limitToString(q.limit, offset)}`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return format(qstr, { paramTypes: { named: [":", ":@" as any] }, language: "postgresql" });
  }
}

function orderByToString(def: Definition, orderBy: QueryOrderByAtomDef[] | undefined): string {
  if (!orderBy?.length) return "";
  return `ORDER BY ${orderBy
    .map((atom) => `${expressionToString(def, atom.exp)} ${atom.direction}`)
    .join(", ")}`;
}

function limitToString(limit: number | undefined, offset: number): string {
  return limit ? `LIMIT ${limit} OFFSET ${offset}` : "";
}

function joinToString(
  def: Definition,
  sourceModel: ModelDef,
  sourceNamePath: string[],
  join: Join,
  isBatching: boolean
): string {
  const namePath = [...sourceNamePath, join.relname];
  const ref = getRef(def, sourceModel.refKey, join.relname, ["reference", "relation", "query"]);
  const model = getTargetModel(def, ref.refKey);
  const joinNames = getJoinNames(def, ref.refKey);
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
  JOIN ${refToTableSqlFragment(def, ref, isBatching)}
  AS ${namePathToAlias(namePath)}
  ON ${expressionToString(def, joinFilter)}
  ${aggregateJoins.join("\n")}
  ${join.joins.map((j) => joinToString(def, model, namePath, j, isBatching))}
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
          const computed = getRef.computed(def, tpath.leaf.refKey);
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
  const ref = getRef(def, typedPath.leaf.refKey, undefined, ["field", "computed", "aggregate"]);
  const name = typedPath.leaf.name;
  return {
    kind: ref.kind,
    refKey: ref.refKey,
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
function collectPaths(def: Definition, q: QueryDef | AggregateDef): string[][] {
  const selectables = q.kind === "query" ? selectToSelectable(q.select) : [];
  const { filter, fromPath } = q.kind === "query" ? q : q.query;
  const computeds = selectables.filter(
    (item): item is SelectComputedItem => item.kind === "computed"
  );
  const aggregates = selectables.filter(
    (item): item is SelectAggregateItem => item.kind === "aggregate"
  );

  const orderBy = q.kind === "query" ? q.orderBy ?? [] : q.query.orderBy ?? [];
  const orderByPaths = orderBy.flatMap((ordering) =>
    collectPathsFromExp(def, expandExpression(def, ordering.exp))
  );

  const allPaths = [
    [...fromPath, "id"],
    ...collectPathsFromExp(def, expandExpression(def, filter)),
    // We only take root-level select - `Selectable`.
    // FIXME is computed still considered selectable? Do we need expressable here?
    // FIXME include aggregates here as well, they need to be in the paths so that
    // we know what to wrap with
    // QueryDef should have "aggregates" in the Join Plan (which are the "Wraps")
    ...computeds.flatMap((item) => {
      const computed = getRef.computed(def, item.refKey);

      const expandedExpression = expandExpression(def, computed.exp);
      const newExp = transformExpressionPaths(
        expandedExpression,
        [computed.modelRefKey],
        _.initial(item.namePath)
      );
      return collectPathsFromExp(def, newExp);
    }),
    ...aggregates.map((a) => a.namePath),
    ...orderByPaths,
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
        const computed = getRef.computed(def, typedPath.leaf.refKey);
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
  ref: ModelDef | ReferenceDef | RelationDef | QueryDef,
  isBatching: boolean
): string {
  const targetModel = getTargetModel(def, ref.refKey);

  // no need to wrap, just source from a model
  switch (ref.kind) {
    case "model":
    case "reference":
    case "relation": {
      return `"${targetModel.dbname}"`;
    }
    case "query": {
      const query = ref;
      const sourceModel = getRef.model(def, ref.modelRefKey);
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
          ${queryToString(def, { ...query, select: [...fields, conn] }, isBatching)})`;
    }
    default: {
      assertUnreachable(ref);
    }
  }
}

function makeAggregateJoin(def: Definition, namePath: NamePath): string {
  const tpath = getTypedPath(def, namePath, {});
  ensureNot(tpath.leaf, null);
  const aggregate = getRef.aggregate(def, tpath.leaf.refKey);

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
  const aggrField = getRef.field(def, aggrTarget.leaf.refKey);

  const expandedFilter = expandExpression(def, query.filter);

  const paths = collectPaths(def, aggregate);
  // FIXME get the aggregate namePath in it as well
  const joinPlan = buildQueryJoinPlan(paths, true);
  const model = getRef(def, joinPlan.sourceModel, undefined, ["model"]);

  const aggrSelects = joinPlan.selectable
    .map((s) => nameToSelectable(def, [model.refKey, s]))
    .filter((s): s is SelectAggregateItem => s.kind === "aggregate");

  const joins = joinPlan.joins.map((j) => joinToString(def, model, [model.name], j, false));
  const filterWhere = expandedFilter
    ? `FILTER(WHERE ${expressionToString(def, expandedFilter)})`
    : "";
  const aggrFieldExpr = `${namePathToAlias(aggregate.query.fromPath)}.${aggrField.dbname}`;
  const aggrJoins = aggrSelects.map((a) => makeAggregateJoin(def, a.namePath));

  const qstr = source`
  (SELECT
    ${namePathToAlias([model.name])}.id,
    ${aggregate.aggrFnName}(${aggrFieldExpr}) ${filterWhere} AS "result"
  FROM ${refToTableSqlFragment(def, model, false)}

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
          const field = getRef.field(def, item.refKey);
          return `${namePathToAlias(_.initial(item.namePath))}."${field.dbname}" AS "${
            item.alias
          }"`;
        }
        case "computed": {
          const computed = getRef.computed(def, item.refKey);
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
    case "lower": {
      return stringifyFn("lower", exp.args);
    }
    case "upper": {
      return stringifyFn("upper", exp.args);
    }
    case "now": {
      return stringifyFn("now", exp.args);
    }
    case "cryptoCompare":
    case "cryptoHash":
      throw new Error(`Expression "${exp.name}" cannot be used in queries.`);
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
      const reference = ref;
      const field = getRef.field(def, reference.fieldRefKey);
      const refField = getRef.field(def, reference.toModelFieldRefKey);

      return { from: field.name, to: refField.name };
    }
    case "relation": {
      const relation = ref;
      const reference = getRef.reference(def, relation.throughRefKey);
      const field = getRef.field(def, reference.fieldRefKey);
      const refField = getRef.field(def, reference.toModelFieldRefKey);

      return { from: refField.name, to: field.name };
    }
    case "query": {
      return { from: "id", to: "__join_connection" };
    }
    default:
      throw new Error(`Kind ${ref.kind} not supported`);
  }
}
