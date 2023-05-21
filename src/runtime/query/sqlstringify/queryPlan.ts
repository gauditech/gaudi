import _ from "lodash";

import { AggregateFunctionName, FunctionName } from "@src/types/definition";

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
