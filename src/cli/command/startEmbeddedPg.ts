import EmbeddedPostgres from "embedded-postgres";
import _ from "lodash";
import { ArgumentsCamelCase } from "yargs";

import { Stoppable } from "../types";

import { EngineConfig } from "@src/config";

// --- server commands

export function startEmbeddedPg(_args: ArgumentsCamelCase, config: EngineConfig): Stoppable {
  const conn = config.dbConn;
  const dir = "./data/db";
  const port: number | undefined = (conn.port && parseInt(conn.port, 10)) || undefined;

  console.log("Starting embedded PostgreSQL ... ");
  const pg = new EmbeddedPostgres({
    database_dir: dir,
    user: conn.user,
    password: conn.password,
    persistent: true,
    port,
  });

  init(pg, conn.database)
    .then(() => console.info(`Embedded postgreSQL is running on port ${port}`))
    .catch(() => console.error(`Failed to start embedded postgreSQL on port ${port}`));

  return {
    stop: () => pg.stop(),
  };
}

function init(pg: EmbeddedPostgres, database: string | null | undefined): Promise<void> {
  return pg
    .initialise()
    .catch(_.noop) // already initialised
    .then(() => pg.start())
    .then(() => {
      if (database) {
        return (
          pg
            .createDatabase(database)
            // database already created?
            .catch(_.noop)
        );
      } else {
        return Promise.resolve();
      }
    })
    .then(_.noop);
}
