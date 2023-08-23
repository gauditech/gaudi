import { Knex, knex } from "knex";

export type DbConn = Knex | Knex.Transaction;

export function createDbConn(urlString: string): DbConn {
  if (urlString.startsWith("sqlite")) {
    return createSqlite(urlString);
  } else {
    return createPostgres(urlString);
  }
}

function createPostgres(urlString: string): DbConn {
  // TODO: parse the string and check for 'schema'
  return knex({
    client: "pg",
    connection: urlString,
  });
}

function createSqlite(urlString: string) {
  return knex({
    client: "sqlite",
    connection: {
      // remove `sqlite://` part
      filename: urlString.substring(9),
    },
    pool: {
      // this is required in order to support ON DELETE
      // and foreign key checks in general
      afterCreate: (conn: any, cb: any) => {
        conn.run("PRAGMA foreign_keys = ON", cb);
      },
    },
    useNullAsDefault: true,
  });
}
