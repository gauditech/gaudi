import { kindFilter } from "@gaudi/compiler/dist/common/kindFilter";
import { transformExpressionPaths } from "@gaudi/compiler/dist/common/query";
import { getRef, getSourceRef, getTargetModel } from "@gaudi/compiler/dist/common/refs";
import {
  UnreachableError,
  assertUnreachable,
  ensureEqual,
  ensureNot,
  shouldBeUnreachableCb,
} from "@gaudi/compiler/dist/common/utils";
import { getTypedPath } from "@gaudi/compiler/dist/composer/utils";
import {
  AggregateFunctionName,
  Definition,
  FunctionName,
  InCollectionFunctionName,
  QueryDef,
  SelectItem,
  TypedAliasReference,
  TypedExprDef,
} from "@gaudi/compiler/dist/types/definition";
import { Literal } from "@gaudi/compiler/dist/types/specification";
import _ from "lodash";
import { match } from "ts-pattern";

import { NamePath } from "@runtime/query/build";

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
      literal: Literal;
    }
  | {
      kind: "alias";
      value: NamePath;
    }
  | { kind: "array"; elements: QueryPlanExpression[] }
  | {
      kind: "function";
      fnName: FunctionName | AggregateFunctionName;
      args: QueryPlanExpression[];
    }
  | { kind: "variable"; contextPath: string[] }
  | {
      kind: "in-subquery";
      plan: QueryPlan;
      operator: InCollectionFunctionName;
      lookupExpression: QueryPlanExpression;
    };

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
    joins: buildJoins(def, q.fromPath, atoms, "inner"),
    limit: q.limit,
    offset: q.offset,
  };
}

function buildSelect(def: Definition, items: SelectItem[]): QueryPlan["select"] {
  if (items.length === 0) return undefined;

  const pairs = items.map((item) =>
    match(item)
      .with({ kind: "expression" }, (item) => [
        item.alias,
        toQueryExpr(def, expandExpression(def, item.expr)),
      ])
      .otherwise(shouldBeUnreachableCb(`${item.kind} is not selectable item`))
  );
  return Object.fromEntries(pairs);
}

export function collectQueryAtoms(def: Definition, q: QueryDef): QueryAtom[] {
  const fromPathAtom: QueryAtom = { kind: "table-namespace", namePath: q.fromPath };

  // collect from select
  const selectAtoms = q.select.flatMap((item) =>
    match<typeof item, QueryAtom[]>(item)
      .with({ kind: "expression" }, (item) => {
        const expr = expandExpression(def, item.expr);
        return pathsFromExpr(expr);
      })
      .otherwise(shouldBeUnreachableCb(`${item.kind} is not selectable item`))
  );
  const filterAtoms = pathsFromExpr(expandExpression(def, q.filter));
  const orderByAtoms = (q.orderBy ?? []).flatMap((order) =>
    pathsFromExpr(expandExpression(def, order.exp))
  );
  return getFinalQueryAtoms([fromPathAtom, ...selectAtoms, ...filterAtoms, ...orderByAtoms]);
}

function pathsFromExpr(expr: TypedExprDef): QueryAtom[] {
  return match<typeof expr, QueryAtom[]>(expr)
    .with({ kind: "identifier-path" }, (a) => [
      { kind: "table-namespace", namePath: _.initial(a.namePath) },
    ])
    .with({ kind: "function" }, (fn) => fn.args.flatMap((a) => pathsFromExpr(a)))
    .with({ kind: "literal" }, { kind: "alias-reference" }, undefined, () => [])
    .with({ kind: "aggregate-function" }, (aggr) => [
      {
        kind: "aggregate",
        fnName: aggr.fnName,
        sourcePath: aggr.sourcePath,
        targetPath: aggr.targetPath,
      },
    ])
    .with({ kind: "in-subquery" }, (sub) => pathsFromExpr(sub.lookupExpression))
    .with({ kind: "array" }, (array) => array.elements.flatMap((e) => pathsFromExpr(e)))
    .with({ kind: "hook" }, shouldBeUnreachableCb("Hooks can't be executed in DB context"))
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
  fromPath: NamePath,
  atoms: QueryAtom[],
  joinType: "inner" | "left"
): QueryPlanJoin[] {
  const joins = atoms.map(
    (atom): QueryPlanJoin =>
      match<typeof atom, QueryPlanJoin>(atom)
        .with({ kind: "table-namespace" }, (atom) => {
          // if atom namepath is not part of query's `fromPath`,
          // we force the left join. This is a must for `select` atoms,
          // but not required for `filter` atoms unless NULL is a valid filter --
          // so this is something to be optimized later
          const finalJoinType = (() => {
            if (_.isEqual(_.take(fromPath, atom.namePath.length), atom.namePath)) {
              return joinType;
            } else {
              return "left";
            }
          })();
          // figures out if this is an inline or subquery
          const tpath = getTypedPath(def, atom.namePath, {});
          ensureEqual(tpath.leaf, null, tpath.leaf?.name);
          const ref = getRef(def, _.last(tpath.nodes)!.refKey);
          return match<typeof ref, QueryPlanJoin>(ref)
            .with({ kind: "reference" }, { kind: "relation" }, (ref) => {
              return {
                kind: "inline",
                joinType: finalJoinType,
                target: ref.name, // FIXME we don't need this
                modelName: getTargetModel(def, ref.refKey).name,
                namePath: atom.namePath,
                joinOn: calculateJoinOn(def, atom.namePath),
              };
            })
            .with({ kind: "query" }, (ref) => {
              const plan = buildQueryPlan(def, ref);
              return {
                kind: "subquery",
                joinType: finalJoinType,
                namePath: atom.namePath,
                joinOn: calculateJoinOn(def, atom.namePath),
                plan,
              };
            })
            .otherwise(() => {
              throw new UnreachableError("");
            });
        })
        .with({ kind: "aggregate" }, (atom) => {
          const ref = getSourceRef(def, atom.sourcePath);
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
                [entryModel.name, ..._.initial(atom.targetPath)],
                getFinalQueryAtoms(
                  pathsFromExpr(
                    expandExpression(def, {
                      kind: "identifier-path",
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
                        kind: "identifier-path",
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
  if (!texpr) {
    throw new UnreachableError(`Expected an expression, got undefined`);
  }
  return match<typeof texpr, QueryPlanExpression>(texpr)
    .with({ kind: "identifier-path" }, (a) => {
      /**
       * FIXME this function needs access to `Definition` in order to extract `dbname`.
       * Perhaps there is a better way?
       */
      const tpath = getTypedPath(def, a.namePath, {});
      const field = getRef.field(def, tpath.leaf!.refKey);
      return { kind: "alias", value: [..._.initial(a.namePath), field.dbname] };
    })
    .with({ kind: "function" }, (fn) => ({
      kind: "function",
      fnName: fn.name,
      args: fn.args.map((arg) => toQueryExpr(def, arg)),
    }))
    .with({ kind: "literal" }, ({ literal }) => ({ kind: "literal", literal }))
    .with({ kind: "alias-reference" }, _.unary(aliasReferenceToVariable))
    .with({ kind: "aggregate-function" }, (aggr) => ({
      kind: "alias",
      value: [...aggr.sourcePath, aggr.fnName.toUpperCase(), ...aggr.targetPath, "result"],
    }))
    .with({ kind: "in-subquery" }, (sub) => {
      const ref = getSourceRef(def, sub.sourcePath);
      const entryModel = getTargetModel(def, ref.refKey);
      const plan: QueryPlan = {
        entry: entryModel.name,
        fromPath: [entryModel.name, ..._.initial(sub.targetPath)],
        groupBy: [],
        joins: buildJoins(
          def,
          [entryModel.name, ..._.initial(sub.targetPath)],
          getFinalQueryAtoms(
            pathsFromExpr(
              expandExpression(def, {
                kind: "identifier-path",
                namePath: [entryModel.name, ...sub.targetPath],
              })
            )
          ),
          "inner"
        ),
        select: {
          target: toQueryExpr(
            def,
            expandExpression(def, {
              kind: "identifier-path",
              namePath: [entryModel.name, ...sub.targetPath],
            })
          ),
        },
      };
      return {
        kind: "in-subquery",
        plan,
        operator: sub.fnName,
        lookupExpression: toQueryExpr(def, expandExpression(def, sub.lookupExpression)),
      };
    })
    .with({ kind: "array" }, (array) => ({
      kind: "array",
      elements: array.elements.map((element) => toQueryExpr(def, expandExpression(def, element))),
    }))
    .with({ kind: "hook" }, () => {
      throw new UnreachableError(`${texpr.kind} cannot be executed in DB query context`);
    })
    .exhaustive();
}

function aliasReferenceToVariable(ref: TypedAliasReference): QueryPlanExpression {
  return { kind: "variable", contextPath: _.compact([ref.source, ...ref.path]) };
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
    case "in-subquery": {
      return { ...exp, lookupExpression: expandExpression(def, exp.lookupExpression) };
    }
    case "aggregate-function":
    case "literal":
    case "alias-reference":
      return exp;
    case "identifier-path": {
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
    case "array": {
      return {
        ...exp,
        elements: exp.elements.map((arg) => expandExpression(def, arg)),
      };
    }
    case "hook": {
      throw new UnreachableError("Hooks and queries cannot be executed in DB query context");
    }
    default: {
      assertUnreachable(exp);
    }
  }
}
