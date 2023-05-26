import _ from "lodash";
import { match } from "ts-pattern";

import { NamePath, transformExpressionPaths } from "./build";

import { kindFilter } from "@src/common/kindFilter";
import { getRef, getTargetModel } from "@src/common/refs";
import { UnreachableError, assertUnreachable, ensureEqual, ensureNot } from "@src/common/utils";
import { getTypedPath } from "@src/composer/utils";
import {
  AggregateFunctionName,
  Definition,
  FunctionName,
  QueryDef,
  SelectItem,
  TypedExprDef,
} from "@src/types/definition";

// FIXME support dbname and real table names
export type QueryPlan = {
  entry: string;
  /**
   * NOTE: `fromPath` is only needed to build a `select "My.target.table".*`.
   * This can be removed if `QueryPlanExpression` supported selecting *,
   * Then it could be embedded into `select` (which would be required field in that case)
   */
  fromPath: NamePath;
  joins: QueryPlanJoin[];
  groupBy: NamePath[];
  filter?: QueryPlanExpression;
  select?: Record<string, QueryPlanExpression>; // key is 'alias'
  orderBy?: [QueryPlanExpression, "asc" | "desc"][];
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
    fromPath: q.fromPath,
    filter: q.filter ? toQueryExpr(def, expandExpression(def, q.filter)) : undefined,
    select: q.select.length > 0 ? buildSelect(def, q.select) : undefined,
    groupBy: [],
    orderBy:
      q.orderBy?.map((ord) => [toQueryExpr(def, expandExpression(def, ord.exp)), ord.direction]) ??
      undefined,
    joins: buildJoins(def, atoms, "inner"),
    limit: q.limit,
    offset: q.offset,
  };
}

function buildSelect(def: Definition, items: SelectItem[]): QueryPlan["select"] {
  const pairs = items.map((item) =>
    match(item)
      .with({ kind: "field" }, { kind: "computed" }, (item) => [
        item.alias,
        toQueryExpr(def, expandExpression(def, { kind: "alias", namePath: item.namePath })),
      ])
      .otherwise(() => {
        throw new UnreachableError(
          `Select can currently be built only from fields and computeds, got ${item.kind} instead`
        );
      })
  );
  return Object.fromEntries(pairs);
}

export function collectQueryAtoms(def: Definition, q: QueryDef): QueryAtom[] {
  const fromPathAtom: QueryAtom = { kind: "table-namespace", namePath: q.fromPath };

  // collect from select
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
  return getFinalQueryAtoms([fromPathAtom, ...selectAtoms, ...filterAtoms]);
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

function getFinalQueryAtoms(atoms: QueryAtom[]): QueryAtom[] {
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
  const tablePathsWithSubpaths = tablePaths.flatMap((path) => buildNamePathSubranges(path));
  return _.sortBy(
    _.uniqBy(tablePathsWithSubpaths, (path) => path.join(".")),
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

function buildJoins(
  def: Definition,
  atoms: QueryAtom[],
  joinType: "inner" | "left"
): QueryPlanJoin[] {
  const joins = atoms.map(
    (atom): QueryPlanJoin =>
      match(atom)
        .with({ kind: "table-namespace" }, (atom): QueryPlanJoin => {
          // we need to figure out if this is an inline or subquery
          const tpath = getTypedPath(def, atom.namePath, {});
          ensureEqual(tpath.leaf, null, tpath.leaf?.name);
          const ref = getRef(def, _.last(tpath.nodes)!.refKey);
          return match(ref)
            .with({ kind: "reference" }, { kind: "relation" }, (ref): QueryPlanJoin => {
              return {
                kind: "inline",
                joinType,
                target: ref.name, // FIXME we don't need this
                modelName: getTargetModel(def, ref.refKey).name,
                namePath: atom.namePath,
                joinOn: calculateJoinOn(def, atom.namePath),
              };
            })
            .with({ kind: "query" }, (ref): QueryPlanJoin => {
              const plan = buildQueryPlan(def, ref);
              return {
                kind: "subquery",
                joinType,
                namePath: atom.namePath,
                joinOn: calculateJoinOn(def, atom.namePath),
                plan,
              };
            })
            .otherwise(() => {
              throw new UnreachableError("");
            });
        })
        .with({ kind: "aggregate" }, (atom): QueryPlanJoin => {
          function getSourceRef(sourcePath: NamePath) {
            const tpath = getTypedPath(def, sourcePath, {});
            if (tpath.nodes.length) {
              return getRef(def, _.last(tpath.nodes)!.refKey);
            } else {
              return match(tpath.source)
                .with({ kind: "model" }, (source) => getRef(def, source.refKey))
                .otherwise(() => {
                  throw new UnreachableError("Doesn't support paths from the context");
                });
            }
          }
          const ref = getSourceRef(atom.sourcePath);
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
              fromPath: [entryModel.name, ..._.initial(atom.targetPath)],
              groupBy: [[entryModel.name, "id"]],
              joins: buildJoins(
                def,
                getFinalQueryAtoms(
                  pathsFromExpr(
                    expandExpression(def, {
                      kind: "alias",
                      namePath: [entryModel.name, ...atom.targetPath],
                    })
                  )
                ),
                "left"
              ),
              select: {
                __join_connection: { kind: "alias", value: [entryModel.name, "id"] },
                result: {
                  kind: "function",
                  fnName: atom.fnName,
                  args: [
                    toQueryExpr(
                      def,
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

function buildNamePathSubranges(path: NamePath): NamePath[] {
  if (path.length < 2) {
    return [];
  }
  return _.range(2, path.length + 1).map((val) => _.take(path, val));
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
    .with({ kind: "relation" }, (rel): [NamePath, NamePath] => {
      const reference = getRef.reference(def, rel.throughRefKey);
      const field = getRef.field(def, reference.fieldRefKey);
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

function toQueryExpr(def: Definition, texpr: TypedExprDef): QueryPlanExpression {
  return match(texpr)
    .with({ kind: "alias" }, (a): QueryPlanExpression => {
      /**
       * FIXME this function needs access to `Definition` in order to extract `dbname`.
       * Perhaps there is a better way?
       */
      const tpath = getTypedPath(def, a.namePath, {});
      const field = getRef.field(def, tpath.leaf!.refKey);
      return { kind: "alias", value: [..._.initial(a.namePath), field.dbname] };
    })
    .with(
      { kind: "function" },
      (fn): QueryPlanExpression => ({
        kind: "function",
        fnName: fn.name,
        args: fn.args.map((arg) => toQueryExpr(def, arg)),
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
      ensureNot(tpath.leaf, null, `${exp.namePath.join(".")} ends without leaf`);
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
