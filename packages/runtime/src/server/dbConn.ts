import { Knex, knex } from "knex";

export type DbConn = Knex | Knex.Transaction;

export function createDbConn(urlString: string): DbConn {
  const config = parseConnectionString(urlString);
  if (config.provider === "postgresql") {
    return createPostgres(config);
  } else {
    return createSqlite(config);
  }
}

type Config = PostgresqlConfig | SqliteConfig;
type PostgresqlConfig = {
  provider: "postgresql";
  // TODO: support `schema`
  connection: string;
};
type SqliteConfig = {
  provider: "sqlite";
  filename: string;
};

export function parseConnectionString(conn: string): Config {
  if (conn.startsWith("sqlite")) {
    return {
      provider: "sqlite",
      // remove `sqlite://` part
      filename: conn.substring(9),
    };
  }
  if (conn.startsWith("postgres")) {
    return {
      provider: "postgresql",
      connection: conn,
    };
  }
  throw new Error(`Unsupported database provider: ${conn}`);
}

function createPostgres(config: PostgresqlConfig): DbConn {
  return knex({
    client: "pg",
    connection: config.connection,
  });
}

function createSqlite(config: SqliteConfig) {
  return knex({
    client: "sqlite",
    connection: {
      filename: config.filename,
    },
    pool: {
      // this is required in order to support ON DELETE
      // and foreign key checks in general
      afterCreate: (conn: any, cb: any) => {
        conn.run("PRAGMA foreign_keys = ON", cb);
      },
    },
    // suppress knex warnings
    useNullAsDefault: true,
  });
}
