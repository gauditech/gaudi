import path from "path";

import { Express, NextFunction, Request, Response, static as staticHandler } from "express";
import { OpenAPIV3 } from "openapi-types";
import { serve, setup } from "swagger-ui-express";

import { buildOpenAPI } from "@src/builder/openAPI";
import { saveOutputFile } from "@src/common/utils";
import { buildEntrypoints } from "@src/runtime/server/admin";
import { buildEndpoints as buildAuthEndpoints } from "@src/runtime/server/authentication";
import { getAppContext } from "@src/runtime/server/context";
import { buildEndpointConfig, registerServerEndpoint } from "@src/runtime/server/endpoints";
import { EndpointConfig } from "@src/runtime/server/types";
import { Definition, EntrypointDef } from "@src/types/definition";

/** Create endpoint handlers, OpenAPI specs and attach them to server instance */
export function setupServerApis(definition: Definition, app: Express) {
  const config = getAppContext(app).config;

  // --- static folder (eg. for API specs)
  const specOutputFolder = path.join(config.outputFolder, "api-spec");
  app.use("/api-spec", staticHandler(specOutputFolder));

  // --- definition API (aka the "blueprint")
  const definitionEntrypoints = definition.entrypoints;
  const definitionEndpointConfigs = buildEndpointConfig(definition, definitionEntrypoints);
  setupEntrypointApi(
    "api",
    definition,
    definitionEntrypoints,
    definitionEndpointConfigs,
    app,
    specOutputFolder
  );

  // --- admin API
  const adminEntrypoints = buildEntrypoints(definition);
  const adminEndpointConfigs = buildEndpointConfig(definition, adminEntrypoints);
  setupEntrypointApi(
    "api-admin",
    definition,
    adminEntrypoints,
    adminEndpointConfigs,
    app,
    specOutputFolder
  );

  // --- authentication API
  const authConfigs = buildAuthEndpoints();
  setupConfigEndpoints("api", authConfigs, app);
}

/** Create API endpoints from entrypoints.*/
function setupEntrypointApi(
  name: string,
  definition: Definition,
  entrypoints: EntrypointDef[],
  endpointConfigs: EndpointConfig[],
  app: Express,
  outputFolder: string
) {
  const basePath = `/${name}`;
  const specFile = path.join(outputFolder, `${name}.openapi.json`);

  endpointConfigs.forEach((epc) => registerServerEndpoint(app, epc, basePath));

  setupEntrypointApiSpec(definition, entrypoints, app, basePath, specFile);
}

/** Create API OpenAPI spec from entrpyoints */
function setupEntrypointApiSpec(
  definition: Definition,
  entrypoints: EntrypointDef[],
  app: Express,
  basePath: string,
  outputFile: string
) {
  const openApi = buildOpenAPI(
    { models: definition.models, entrypoints, populators: [] },
    basePath
  );

  saveOutputFile(outputFile, JSON.stringify(openApi, undefined, 2));

  setupEntrypointApiSwagger(openApi, app, basePath);
}

function setupEntrypointApiSwagger(
  openApiDocument: OpenAPIV3.Document,
  app: Express,
  apiPath: string
) {
  const swaggerPath = `${apiPath}-docs`;

  app.use(swaggerPath, serve, (_req: Request, _resp: Response, _next: NextFunction) =>
    setup(openApiDocument)(_req, _resp, _next)
  );
}

/** Setup API endpoints from endpoint configs */
function setupConfigEndpoints(name: string, configs: EndpointConfig[], app: Express) {
  const basePath = `/${name}`;

  configs.forEach((epc) => {
    registerServerEndpoint(app, epc, basePath);
  });

  // NOTE: we cannot currently create OpenAPI spec from endpoint configs
}
