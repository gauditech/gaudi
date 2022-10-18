import knex from "knex";

export const db = knex({
  client: "pg",
  connection: {
    database: "gaudi",
    user: "gaudi",
    password: "gaudip",
    host: "127.0.0.1",
    port: 5432,
  },
});
