import { source } from "common-tags";

import { buildTargetsSQL } from "@src/builder/query";
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

/** Used as a context var name where action result is stored. */
export const EndpointResponseVarname = "__gaudi_action_result__";

export type EndpointActionDefaultResponse = { message: string };

export function renderEndpointActionErrorDefaultResponse(message: string): string {
  const response: EndpointActionDefaultResponse = { message };

  return JSON.stringify(response);
}

function buildParamName(ep: EntrypointDef): string {
  return `${ep.target.type}_${ep.target.identifyWith.name}`.toLowerCase();
}

export type PathParam = { path: string; params: { name: string; type: "integer" | "text" }[] };

export function buildEndpointPaths(entrypoints: EntrypointDef[]): {
  single: PathParam;
  multi: PathParam;
} {
  const pairs = entrypoints.map((ep) => ({
    name: ep.target.name.toLowerCase(),
    param: { name: buildParamName(ep), type: ep.target.identifyWith.type },
  }));
  const single = {
    path: [
      "", // add leading slash
      ...pairs.map(({ name, param }) => [name, `:${param.name}`].join("/")),
    ].join("/"),
    params: pairs.map(({ param }) => param),
  };
  const multi = {
    path: [
      "", // add leading slash
      ...pairs
        .slice(0, pairs.length - 1)
        .map(({ name, param }) => [name, `:${param.name}`].join("/")),
      pairs[pairs.length - 1].name,
    ].join("/"),
    params: pairs.slice(0, pairs.length - 1).map(({ param }) => param),
  };
  return { single, multi };
}

export function render(data: RenderEndpointsData): string {
  // prettier-ignore
  return source`
  const { endpointHandlerGuard, EndpointError } = require("./common.js");
  const { Prisma, PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();

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
  ${(data.definition.entrypoints).flatMap(entrypoint => processEntrypoint(data, entrypoint, []))}

  // ----- commons
  
  async function fetchSingleAction(ctx) {
    // TODO: execute query
    try {
      return \`Example fetch-one action result \${new Date().toISOString()}\`
    }
    catch(err) {
      // TODO: custom user message
      throw new EndpointError(404, ${renderEndpointActionErrorDefaultResponse('Not found')})
    }
  }

  async function fetchManyAction(ctx) {
    // TODO: execute query
    return [\`Example list action result \${new Date().toISOString()}\`]
  }

  // ----- export

  module.exports = {
    setupEndpoints
  }
  `
}

function processEntrypoint(
  data: RenderEndpointsData,
  entrypoint: EntrypointDef,
  parentEntrypoints: EntrypointDef[]
): string[] {
  const entrypoints = [...parentEntrypoints, entrypoint];
  const endpointOuts = entrypoint.endpoints.map((ep) => processEndpoint(data, ep, entrypoints));

  return [
    ...endpointOuts,
    ...(entrypoint.entrypoints?.flatMap((ep) => processEntrypoint(data, ep, entrypoints)) ?? []),
  ];
}

function processEndpoint(
  data: RenderEndpointsData,
  endpoint: EndpointDef,
  parentEntrypoints: EntrypointDef[]
): string {
  switch (endpoint.kind) {
    case "get":
      return renderGetEndpoint(data, endpoint, parentEntrypoints);
    case "list":
      return renderListEndpoint(data, endpoint, parentEntrypoints);
    default:
      return `// TODO: implement endpoint kind "${endpoint.kind}"`;
  }
}

export function renderGetEndpoint(
  data: RenderEndpointsData,
  endpoint: GetEndpointDef,
  entrypoints: EntrypointDef[]
): string {
  const entryName = entrypoints.map((e) => e.name).join("");
  const endpointName = `get${entryName}Endpoint`;
  const httpMethod = "get";
  const endpointPath = buildEndpointPaths(entrypoints).single;

  // prettier-ignore
  return source`
    // --- ${endpointName}
    async function ${endpointName}(req, resp) {
      // TODO: role auth
      // TODO: select
      // TODO: filter

      const ctx = new Map();

      // extract path vars
      ${endpointPath.params.map(param => {
        const varname = param.name
        return `const ${varname} = req.params["${varname}"]`
      })}

      // TODO: validate path vars?

      let result;
      try {
        result = await prisma.$queryRaw\`${buildTargetsSQL(data.definition, entrypoints, endpointPath)}\`;
        if(result.length === 0) {
          throw new EndpointError(404, 'Resource not found')
        }

        resp.send(result[0])
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
  data: RenderEndpointsData,
  endpoint: ListEndpointDef,
  entrypoints: EntrypointDef[]
): string {
  const entryName = entrypoints.map((e) => e.name).join("");
  const endpointName = `list${entryName}Endpoint`;
  const httpMethod = "get";
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

      let result;
      try {
        result = await fetchManyAction(ctx);

        ${endpoint.actions.map(action => ''
          // renderEndpointAction(action)
        )}

        resp.send(result)
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
