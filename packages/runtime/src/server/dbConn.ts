import { Knex, knex } from "knex";

export type DbConn = Knex | Knex.Transaction;
export type DbQueryBuilder = Knex.QueryBuilder;

export function createDbConn(urlString: string): DbConn {
  if (urlString.startsWith("sqlite")) {
    return createSqlite(urlString);
  } else {
    return createPostgres(urlString);
  }
}

function createPostgres(urlString: string): DbConn {
  return knex({
    client: "pg",
    connection: urlString,
  });
}

function createSqlite(urlString: string) {
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
