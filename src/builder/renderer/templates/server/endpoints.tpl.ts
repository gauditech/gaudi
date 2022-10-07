import { buildEndpointPath } from "@src/builder/renderer/templates/util/definition";
import { ActionDef, Definition, GetEndpointDef, ListEndpointDef } from "@src/types/definition";
import { source } from "common-tags";

export type RenderEndpointsData = {
  definition: Definition;
};

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
  ${data.definition.entrypoints.flatMap(entrypoint =>
    entrypoint.endpoints.map(endpoint => {
      if (endpoint.kind === 'get') {
        return renderGetEndpoint(endpoint)
      }
      else if (endpoint.kind === 'list') {
        return renderListEndpoint(endpoint)
      }
      else {
        return `
          // TODO: Unknown endpoint kind
        `
      }
    })
  )}

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

export function renderGetEndpoint(endpoint: GetEndpointDef): string {
  const endpointName = `${endpoint.name}Endpoint`;
  const endpointPath = buildEndpointPath(endpoint.path);
  const httpMethod = "get";

  // prettier-ignore
  return source`
    // ${endpointName}
    async function ${endpointName}(req, resp) {
      // TODO: role auth
      // TODO: select
      // TODO: filter

      const ctx = new Map();

      // extract path vars
      ${endpoint.path.map(p => {
        if (p.type === 'numeric' || p.type === 'text') {
          return `ctx.set("${p.varname}", req.params["${p.varname}"]);`
        }
      })}
          
      try {
        // actions
        ${endpoint.actions.map(action => 
          renderEndpointAction(action)
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
    endpointConfigs.push({ path: "${endpointPath}", method: "${httpMethod}", handler: ${endpointName} })

  `
}

export function renderListEndpoint(endpoint: ListEndpointDef): string {
  const endpointName = `${endpoint.name}Endpoint`;
  const endpointPath = buildEndpointPath(endpoint.path);
  const httpMethod = "get";

  // prettier-ignore
  return source`
    // ${endpointName}
    async function ${endpointName}(req, resp) {
      // TODO: role auth
      // TODO: select
      // TODO: filter
    
      const ctx = new Map();

      ${endpoint.path.map(p => {
        if (p.type === 'numeric' || p.type === 'text') {
          return `ctx.set("${p.varname}", req.params["${p.varname}"]);`
        }
      })}
          
      try {
        ${endpoint.actions.map(action => 
          renderEndpointAction(action)
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
    endpointConfigs.push({ path: "${endpointPath}", method: "${httpMethod}", handler: ${endpointName} })

  `
}

export function renderEndpointAction(action: ActionDef): string {
  // fetch one
  if (action.kind === "fetch one") {
    // prettier-ignore
    return source`
      try {
        const ${action.varname} = await fetchOneAction(ctx);
        ctx.set("${action.varname}", ${action.varname})
      }
      catch(err) {
        throw new EndpointError(${action.onError.statusCode}, ${JSON.stringify(action.onError.body)}, err)
      }
    `;
  }
  // fetch many
  else if (action.kind === "fetch many") {
    // prettier-ignore
    return source`
      const ${action.varname} = await fetchManyAction(ctx);
      ctx.set("${action.varname}", ${action.varname})
    `;
  }
  // respond
  else if (action.kind === "respond") {
    // prettier-ignore
    return source`
      resp.send(ctx.get("${action.varname}"))
    `;
  } else {
    throw `Unknown endpoint action kind`;
  }
}
