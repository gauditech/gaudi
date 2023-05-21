import _ from "lodash";
import { match } from "ts-pattern";

import { transformExpressionPaths } from "../build";

import { kindFilter } from "@src/common/kindFilter";
import { getRef, getTargetModel } from "@src/common/refs";
import { UnreachableError, assertUnreachable, ensureNot } from "@src/common/utils";
import { getTypedPath } from "@src/composer/utils";
import {
  AggregateFunctionName,
  Definition,
  FunctionName,
  QueryDef,
  TypedExprDef,
} from "@src/types/definition";

type NamePath = string[];

// FIXME support dbname and real table names
export type QueryPlan = {
  entry: string;
  joins: QueryPlanJoin[];
  groupBy: NamePath[];
  filter?: QueryPlanExpression;
  select?: Record<string, QueryPlanExpression>; // key is 'alias'
  orderBy?: [NamePath, "asc" | "desc"][];
  limit?: number;
  offset?: number;
};

export type JoinWithSubquery = {
  kind: "subquery";
  joinType: "inner" | "left";
  joinOn: [NamePath, NamePath];
  namePath: NamePath;
  plan: QueryPlan;
};

export type InlineJoin = {
  kind: "inline";
  joinType: "inner" | "left";
  joinOn: [NamePath, NamePath];
  target: string;
  modelName: string;
  namePath: NamePath;
};

export type QueryPlanJoin = JoinWithSubquery | InlineJoin;

export type QueryPlanExpression =
  | {
      kind: "literal";
      type: "boolean" | "null" | "text" | "integer";
      value: unknown;
    }
  | {
      kind: "alias";
      value: NamePath;
    }
  | { kind: "function"; fnName: FunctionName | AggregateFunctionName; args: QueryPlanExpression[] }
  | { kind: "variable"; name: string };

export type QueryAtom = QueryAtomTable | QueryAtomAggregate;

type QueryAtomTable = {
  kind: "table-namespace";
  namePath: NamePath;
};

type QueryAtomAggregate = {
  kind: "aggregate";
  fnName: FunctionName | AggregateFunctionName;
  sourcePath: NamePath;
  targetPath: NamePath;
};

/**
 * This function expects a QueryDef with select being only SelectableItem[]
 */
export function buildQueryPlan(def: Definition, q: QueryDef): QueryPlan {
  /**
   * Step 1: collect all the atoms from this query
   */
  // FIXME
  const atoms = collectQueryAtoms(def, q);

  /**
   * Step 2: build the plan
   */

  return {
    entry: q.fromPath[0],
    groupBy: [],
    joins: buildJoins(def, atoms),
  };
}

export function collectQueryAtoms(def: Definition, q: QueryDef): QueryAtom[] {
  // collect from select
  const fromAtoms = _.range(1, q.fromPath.length).map(
    (val): QueryAtom => ({ kind: "table-namespace", namePath: _.take(q.fromPath, val) })
  );
  const selectAtoms = q.select.flatMap((item) =>
    match(item)
      .with({ kind: "field" }, (f): QueryAtom[] => [
        { kind: "table-namespace", namePath: _.initial(f.namePath) },
      ])
      .with({ kind: "computed" }, (c): QueryAtom[] => {
        const expr = expandExpression(def, { kind: "alias", namePath: c.namePath });
        return pathsFromExpr(expr);
      })
      .with({ kind: "aggregate" }, () => {
        throw new UnreachableError("Aggregates not supported");
      })
      .otherwise((i) => {
        throw new UnreachableError(`${i.kind} is not selectable item`);
      })
  );
  const filterAtoms = pathsFromExpr(expandExpression(def, q.filter));
  return _.tail(getUniqueQueryAtoms([...fromAtoms, ...selectAtoms, ...filterAtoms]));
}

function pathsFromExpr(expr: TypedExprDef): QueryAtom[] {
  return match(expr)
    .with({ kind: "aggregate-function" }, (aggr): QueryAtom[] => [
      {
        kind: "aggregate",
        fnName: aggr.fnName,
        sourcePath: aggr.sourcePath,
        targetPath: aggr.targetPath,
      },
    ])
    .with({ kind: "alias" }, (a): QueryAtom[] => [
      { kind: "table-namespace", namePath: _.initial(a.namePath) },
    ])
    .with({ kind: "function" }, (fn) => fn.args.flatMap((a) => pathsFromExpr(a)))
    .with({ kind: "literal" }, { kind: "variable" }, undefined, () => [])
    .exhaustive();
}

function getUniqueQueryAtoms(atoms: QueryAtom[]): QueryAtom[] {
  const tablePaths = getUniqueTablePaths(atoms);
  const aggregates = getUniqueAggregates(atoms);
  const tables = tablePaths.map(
    (path): QueryAtomTable => ({
      kind: "table-namespace",
      namePath: path,
    })
  );
  return [...tables, ...aggregates];
}

function getUniqueTablePaths(atoms: QueryAtom[]): NamePath[] {
  const tablePaths = kindFilter(atoms, "table-namespace").map((a) => a.namePath);
  return _.sortBy(
    _.uniqBy(tablePaths, (path) => path.join(".")),
    (path) => path.join(".")
  );
}

function aggregateToUniqueRepr(aggregate: QueryAtomAggregate): string {
  const sourceStr = aggregate.sourcePath.join(".");
  const fnStr = aggregate.fnName.toUpperCase();
  const targetStr = aggregate.targetPath.join(".");
  return [sourceStr, fnStr, targetStr].join(".");
}

function getUniqueAggregates(atoms: QueryAtom[]): QueryAtomAggregate[] {
  const aggregates = kindFilter(atoms, "aggregate");
  return _.sortBy(_.uniqBy(aggregates, aggregateToUniqueRepr), aggregateToUniqueRepr);
}

function buildJoins(def: Definition, atoms: QueryAtom[]): QueryPlanJoin[] {
  const joins = atoms.map(
    (atom): QueryPlanJoin =>
      match(atom)
        .with({ kind: "table-namespace" }, (atom): QueryPlanJoin => {
          // we need to figure out if this is an inline or subquery
          const tpath = getTypedPath(def, atom.namePath, {});
          const ref = getRef(def, _.last(tpath.nodes)!.refKey);
          return match(ref)
            .with({ kind: "reference" }, { kind: "relation" }, (ref): QueryPlanJoin => {
              return {
                kind: "inline",
                joinType: "inner", // FIXME should every "inline" join be inner? How do we decide?
                target: ref.name, // FIXME we don't need this
                modelName: getTargetModel(def, ref.refKey).name,
                namePath: atom.namePath,
                joinOn: calculateJoinOn(def, atom.namePath),
              };
            })
            .with({ kind: "query" }, (ref): QueryPlanJoin => {
              return {
                kind: "subquery",
                joinType: "inner",
                namePath: atom.namePath,
                joinOn: calculateJoinOn(def, atom.namePath),
                plan: buildQueryPlan(def, ref),
              };
            })
            .otherwise(() => {
              throw new UnreachableError("");
            });
        })
        .with({ kind: "aggregate" }, (atom): QueryPlanJoin => {
          const tpath = getTypedPath(def, atom.sourcePath, {});
          const ref = getRef(def, _.last(tpath.nodes)!.refKey);
          const entryModel = getTargetModel(def, ref.refKey);
          return {
            kind: "subquery",
            joinType: "left",
            joinOn: [
              [...atom.sourcePath, "id"],
              [
                ...atom.sourcePath,
                atom.fnName.toUpperCase(),
                ...atom.targetPath,
                "__join_connection",
              ],
            ],
            namePath: [...atom.sourcePath, atom.fnName.toUpperCase(), ...atom.targetPath],
            plan: {
              entry: entryModel.name, // FIXME could we use dbname here?
              groupBy: [[entryModel.name, ...atom.targetPath, "id"]],
              joins: buildJoins(def, [
                { kind: "table-namespace", namePath: [entryModel.name, ...atom.targetPath] },
              ]), // fixme
              select: {
                __join_connection: { kind: "alias", value: [entryModel.name, "id"] },
                result: {
                  kind: "function",
                  fnName: atom.fnName,
                  args: [
                    toQueryExpr(
                      expandExpression(def, {
                        kind: "alias",
                        namePath: [entryModel.name, ...atom.targetPath],
                      })
                    ),
                  ],
                },
              },
            },
          };
        })
        .exhaustive()
  );
  return joins;
}

function calculateJoinOn(def: Definition, path: NamePath): [NamePath, NamePath] {
  const tpath = getTypedPath(def, path, {});
  const dest = tpath.nodes.at(-1)!;
  const destRef = getRef(def, dest.refKey);
  return match(destRef)
    .with({ kind: "reference" }, (ref): [NamePath, NamePath] => {
      const field = getRef.field(def, ref.fieldRefKey);
      return [
        [..._.initial(path), field.dbname],
        [...path, "id"],
      ];
    })
    .with({ kind: "relation" }, (ref): [NamePath, NamePath] => {
      const field = getRef.field(def, ref.throughRefKey);
      return [
        [..._.initial(path), "id"],
        [...path, field.dbname],
      ];
    })
    .with({ kind: "query" }, (): [NamePath, NamePath] => [
      [..._.initial(path), "id"],
      [...path, "__join_connection"],
    ])
    .otherwise(() => {
      throw new UnreachableError(destRef.kind);
    });
}

function toQueryExpr(texpr: TypedExprDef): QueryPlanExpression {
  return match(texpr)
    .with({ kind: "alias" }, (a): QueryPlanExpression => ({ kind: "alias", value: a.namePath }))
    .with(
      { kind: "function" },
      (fn): QueryPlanExpression => ({
        kind: "function",
        fnName: fn.name,
        args: fn.args.map(toQueryExpr),
      })
    )
    .with(
      { kind: "literal" },
      (lit): QueryPlanExpression => ({ kind: "literal", value: lit.value, type: lit.type })
    )
    .with({ kind: "variable" }, (v): QueryPlanExpression => ({ kind: "variable", name: v.name }))
    .with(
      { kind: "aggregate-function" },
      (aggr): QueryPlanExpression => ({
        kind: "alias",
        value: [...aggr.sourcePath, aggr.fnName.toUpperCase(), ...aggr.targetPath, "result"],
      })
    )
    .with(undefined, () => {
      throw new UnreachableError("");
    })
    .exhaustive();
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
    case "aggregate-function":
    case "literal":
    case "variable":
      return exp;
    case "alias": {
      const tpath = getTypedPath(def, exp.namePath, {});
      ensureNot(tpath.leaf, null);
      switch (tpath.leaf.kind) {
        case "aggregate": {
          throw new UnreachableError("aggregate queries are no longer supported");
        }
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
