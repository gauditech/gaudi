import express, { Request } from "express";
import knex from "knex";

const app = express();
const port = 3002;
const pg = knex({ client: "pg" });
import {
  PathParam,
  buildEndpointPath,
  queryableFromEndpointTargets,
  queryableToString,
  selectToSelectable,
} from "@src/builder/query";
import { Definition } from "@src/types/definition";

function validatePathParam(param: PathParam["params"][number], val: string): string | number {
  switch (param.type) {
    case "integer":
      return parseInt(val, 10);
    case "text":
      return val;
  }
}

export function setupEndpoints(def: Definition) {
  for (const entrypoint of def.entrypoints) {
    for (const endpoint of entrypoint.endpoints) {
      switch (endpoint.kind) {
        case "get": {
          const { path, params } = buildEndpointPath(endpoint);
          app.get(path, (req: Request, res) => {
            // collect path params
            const vars = Object.fromEntries(
              params.map((p) => [p.name, validatePathParam(p, req.params[p.name])])
            );

            // get targets
            const q = queryableFromEndpointTargets(
              def,
              endpoint.targets,
              selectToSelectable(endpoint.response),
              "single"
            );
            const sqlTpl = queryableToString(def, q!);
            const target = pg.raw(sqlTpl, vars);
            res.json(target);
          });
        }
      }
    }
  }
}

/**
 * Here we go again... Returning a query/able, whatever it may be.


from Org.public_repos.issues
filter
      Org.slug is ...
  and public_repos.slug is ...
  and     
*/
