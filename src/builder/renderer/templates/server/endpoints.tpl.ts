import { source } from "common-tags";

import {
  Definition,
  EndpointDef,
  EntrypointDef,
  GetEndpointDef,
  ListEndpointDef,
} from "@src/types/definition";

export type RenderEndpointsData = {
  definition: Definition;
};

export function buildParamName(ep: EntrypointDef): string {
  return `${ep.target.type}_${ep.target.identifyWith.name}`;
}

type PathParam = { path: string; params: { name: string; type: "integer" | "text" }[] };

export function buildEndpointPaths(entrypoints: EntrypointDef[]): {
  single: PathParam;
  multi: PathParam;
} {
  const pairs = entrypoints.map((ep) => ({
    name: ep.target.name,
    param: { name: buildParamName(ep), type: ep.target.identifyWith.type },
  }));
  const single = {
    path: pairs.map(({ name, param }) => [name, param.name].join("/")).join("/"),
    params: pairs.map(({ param }) => param),
  };
  const multi = {
    path: [
      ...pairs.slice(0, pairs.length - 1).map(({ name, param }) => [name, param.name].join("/")),
      pairs[pairs.length].name,
    ].join("/"),
    params: pairs.slice(0, pairs.length - 1).map(({ param }) => param),
  };
  return { single, multi };
}

export function render(data: RenderEndpointsData): string {
  // prettier-ignore
  return source`
  const { endpointHandlerGuard, EndpointError } = require("./common.js");

  // setup endpoints
  const endpointConfigs = [];
  function setupEndpoints(app) {
    endpointConfigs.forEach((ep) => {
      app[ep.method](ep.path, endpointHandlerGuard(ep.handler));
    })
  } 

  // hello world endpoint
  function helloEndpoint(req, res) { res.send("Hello world!") }
  endpointConfigs.push({ path: '/hello', method: 'get', handler: helloEndpoint })

  // definition endpoints
  ${data.definition.entrypoints.flatMap(entrypoint => processEntrypoint(entrypoint, []))}

  // ----- commons
  
  async function fetchOneAction(ctx) {
    // example endpoint error
    const orgId = ctx.get('org_id');
    if (orgId == 3) {
      throw new Error('Example action error')
    }

    // TODO: execute query

    return \`Example fetch-one action result: \${orgId}\`
  }

  async function fetchManyAction(ctx) {
    // TODO: execute query
    return ['Example list action result']
  }

  // ----- export

  module.exports = {
    setupEndpoints
  }
  `
}

function processEntrypoint(
  entrypoint: EntrypointDef,
  parentEntrypoints: EntrypointDef[]
): string[] {
  const entrypoints = [...parentEntrypoints, entrypoint];
  const endpointOuts = entrypoint.endpoints.map((ep) => processEndpoint(ep, entrypoints));

  return [
    ...endpointOuts,
    ...entrypoint.entrypoints.flatMap((ep) => processEntrypoint(ep, entrypoints)),
  ];
}

function processEndpoint(endpoint: EndpointDef, parentEntrypoints: EntrypointDef[]): string {
  switch (endpoint.kind) {
    case "get":
      return renderGetEndpoint(endpoint, parentEntrypoints);
    case "list":
      return renderListEndpoint(endpoint, parentEntrypoints);
    default:
      throw "todo";
  }
}

export function renderGetEndpoint(endpoint: GetEndpointDef, entrypoints: EntrypointDef[]): string {
  const entryName = entrypoints.map((e) => e.name).join("");
  const endpointName = `get${entryName}Endpoint`;
  const httpMethod = "get";
  const endpointPath = buildEndpointPaths(entrypoints).single;

  // prettier-ignore
  return source`
    // ${endpointName}
    async function ${endpointName}(req, resp) {
      // TODO: role auth
      // TODO: select
      // TODO: filter

      const ctx = new Map();

      // extract path vars
      ${endpointPath.params.map(param => {
        const varname = param.name
        return `ctx.set("${varname}", req.params["${varname}"])`
      })}

      try {
        // actions
        ${endpoint.actions.map(action => ''
          // renderEndpointAction(action)
        )}
      } catch(err) {
        if (err instanceof EndpointError) {
          throw err;
        }
        else {
          throw new EndpointError(500, 'Error processing request: ' + err);
        }
      }
    }
    endpointConfigs.push({ path: "${endpointPath.path}", method: "${httpMethod}", handler: ${endpointName} })

  `
}

export function renderListEndpoint(
  endpoint: ListEndpointDef,
  entrypoints: EntrypointDef[]
): string {
  const entryName = entrypoints.map((e) => e.name).join("");
  const endpointName = `list${entryName}Endpoint`;
  const httpMethod = "list";
  const endpointPath = buildEndpointPaths(entrypoints).multi;

  // prettier-ignore
  return source`
    // ${endpointName}
    async function ${endpointName}(req, resp) {
      // TODO: role auth
      // TODO: select
      // TODO: filter

      const ctx = new Map();

      ${endpointPath.params.map(param => {
        const varname = param.name
        return `ctx.set("${varname}", req.params["${varname}"])`
      })}

      try {
        ${endpoint.actions.map(action => ''
          // renderEndpointAction(action)
        )}
      } catch(err) {
        if (err instanceof EndpointError) {
          throw err;
        }
        else {
          throw new EndpointError(500, 'Error processing request: ' + err);
        }
      }
    }
    endpointConfigs.push({ path: "${endpointPath.path}", method: "${httpMethod}", handler: ${endpointName} })

  `
}

// export function renderEndpointAction(action: ActionDef): string {
//   // fetch one
//   if (action.kind === "fetch one") {
//     // prettier-ignore
//     return source`
//       try {
//         const ${action.varname} = await fetchOneAction(ctx);
//         ctx.set("${action.varname}", ${action.varname})
//       }
//       catch(err) {
//         throw new EndpointError(${action.onError.statusCode}, ${JSON.stringify(action.onError.body)}, err)
//       }
//     `;
//   }
//   // fetch many
//   else if (action.kind === "fetch many") {
//     // prettier-ignore
//     return source`
//       const ${action.varname} = await fetchManyAction(ctx);
//       ctx.set("${action.varname}", ${action.varname})
//     `;
//   }
//   // respond
//   else if (action.kind === "respond") {
//     // prettier-ignore
//     return source`
//       resp.send(ctx.get("${action.varname}"))
//     `;
//   } else {
//     throw `Unknown endpoint action kind`;
//   }
// }
