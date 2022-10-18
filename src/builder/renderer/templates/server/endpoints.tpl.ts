import { source } from "common-tags";

import {
  buildEndpointContextSql,
  buildEndpointPath,
  buildEndpointTargetSql,
} from "@src/builder/query";
import {
  Definition,
  EndpointDef,
  EntrypointDef,
  GetEndpointDef,
  ListEndpointDef,
  SelectableItem,
} from "@src/types/definition";

export type RenderEndpointsData = {
  definition: Definition;
};

export type PathParam = { path: string; params: { name: string; type: "integer" | "text" }[] };

export function render(data: RenderEndpointsData): string {
  // prettier-ignore
  return source`
  const yup = require("yup")
  const { Prisma, PrismaClient } = require("@prisma/client");
  const { endpointHandlerGuard, validateRecord, EndpointError } = require("./common.js");

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
      if (err instanceof EndpointError) {
        throw err
      }
      else {
        throw new EndpointError(404, { message: 'Not found' }, err)
      }
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

function paramToType(paramStr: string, type: EntrypointDef["target"]["identifyWith"]["type"]) {
  switch (type) {
    case "integer":
      return `parseInt(${paramStr}, 10)`;
    case "text":
      return paramStr;
  }
}

function renderTargetContext(sql: string | null): string {
  if (!sql) return "";
  return source`
  const contextRows = await prisma.$queryRaw\`${sql}\`;
  if(contextRows.length === 0) {
    throw new EndpointError(404, 'Resource not found')
  }
  `;
}

export function renderGetEndpoint(
  data: RenderEndpointsData,
  endpoint: GetEndpointDef,
  entrypoints: EntrypointDef[]
): string {
  const entryName = entrypoints.map((e) => e.name).join("");
  const endpointName = `get${entryName}Endpoint`;
  const httpMethod = "get";
  const endpointPath = buildEndpointPath(endpoint);
  const resultSql = buildEndpointContextSql(data.definition, endpoint);

  // prettier-ignore
  return source`
    // --- ${endpointName}
    async function ${endpointName}(req, resp) {
      // TODO: role auth
      // TODO: nested select
      // TODO: filter
      // TODO: validate path vars before extracting?

      // extract path vars
      ${endpointPath.params.map(param => {
        const varname = param.name
        return `const ${varname} = ${paramToType(`req.params["${varname}"]`, param.type)}`
      })}

      try {
        ${renderTargetContext(resultSql)}
        resp.send(contextRows[0])
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
  const endpointPath = buildEndpointPath(endpoint);
  const targetChecksSql = buildEndpointContextSql(data.definition, endpoint);
  const listSql = buildEndpointTargetSql(
    data.definition,
    endpoint.targets,
    endpoint.response.filter((s): s is SelectableItem => s.kind === "field"),
    "multi"
  );

  // prettier-ignore
  return source`
    // ${endpointName}
    async function ${endpointName}(req, resp) {
      // TODO: role auth
      // TODO: nested select
      // TODO: filter

      // TODO: validate path vars before extracting?
      // extract path vars
      ${endpointPath.params.map(param => {
        const varname = param.name
        return `const ${varname} = ${paramToType(`req.params["${varname}"]`, param.type)};`
      })}

      try {
        ${renderTargetContext(targetChecksSql)}
        const results = await prisma.$queryRaw\`${listSql}\`
        resp.send(results)
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
