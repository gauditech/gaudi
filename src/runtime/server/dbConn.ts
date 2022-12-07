import { Knex, knex } from "knex";

export type DbConn = Knex | Knex.Transaction;
export type DbQueryBuilder = Knex.QueryBuilder;

export function createDbConn(urlString: string, options?: { schema?: string }): DbConn {
  return knex({
    client: "pg",
    connection: urlString,
    searchPath: options?.schema ? [options.schema] : undefined,
  });
}
