import express, { Request } from "express";
import knex from "knex";

const app = express();
const port = 3002;

import {
  PathParam,
  buildEndpointPath,
  queryableFromEndpointTargets,
  selectToSelectable,
} from "@src/builder/query";
import { Definition, QueryDef, QueryDefPath, TargetDef } from "@src/types/definition";

function validatePathParam(param: PathParam["params"][number], val: string): PathVariable {
  switch (param.type) {
    case "integer":
      return { name: param.name, type: param.type, value: parseInt(val, 10) };
    case "text":
      return { name: param.name, type: param.type, value: val };
  }
}

type PathVariable =
  | { name: string; type: "text"; value: string }
  | { name: string; type: "integer"; value: number };

export function setupEndpoints(def: Definition) {
  for (const entrypoint of def.entrypoints) {
    for (const endpoint of entrypoint.endpoints) {
      switch (endpoint.kind) {
        case "get": {
          const { path, params } = buildEndpointPath(endpoint);
          app.get(path, (req: Request, res) => {
            // collect path params
            const vars = params.map((p) => validatePathParam(p, req.params[p.name]));

            // get targets
            const q = queryableFromEndpointTargets(
              def,
              endpoint.targets,
              selectToSelectable(endpoint.response),
              "single"
            );
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
