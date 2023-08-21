import { Knex, knex } from "knex";

export type DbConn = Knex | Knex.Transaction;
export type DbQueryBuilder = Knex.QueryBuilder;

export function createDbConn(urlString: string, options?: { schema?: string }): DbConn {
  if (urlString.startsWith("sqlite")) {
    return createSqlite(urlString);
  }
  return knex({
    client: "pg",
    connection: urlString,
    searchPath: options?.schema ? [options.schema] : undefined,
  });
}

export function createSqlite(urlString: string) {
  return knex({
    client: "sqlite",
    connection: {
      filename: urlString.substring(9),
    },
    pool: {
      afterCreate: (conn: any, cb: any) => {
        conn.run("PRAGMA foreign_keys = ON", cb);
      },
    },
    useNullAsDefault: true,
  });
}
