import path from "path";

import { buildOpenAPI } from "@gaudi/compiler/dist/builder/openAPI";
import { Logger } from "@gaudi/compiler/dist/common/logger";
import { saveOutputFile } from "@gaudi/compiler/dist/common/utils";
import { Definition } from "@gaudi/compiler/dist/types/definition";
import { Express, NextFunction, Request, Response, static as staticHandler } from "express";
import { OpenAPIV3 } from "openapi-types";
import { serve, setup } from "swagger-ui-express";

import { getAppContext } from "@runtime/server/context";
import { buildEndpointConfig } from "@runtime/server/endpoints";
import { endpointGuardHandler } from "@runtime/server/middleware";
import { EndpointConfig } from "@runtime/server/types";

const logger = Logger.specific("api");

/** Create endpoint handlers, OpenAPI specs and attach them to server instance */
export function setupServerApis(definition: Definition, app: Express) {
  const config = getAppContext(app).config;

  // --- static folder (eg. for API specs)
  const specPath = "/api-spec";
  const specFileName = "api.openapi.json";
  const specOutputFolder = path.join(config.outputFolder, specPath);
  app.use(specPath, staticHandler(specOutputFolder));
  logger.info(
    `registered OpenAPI specification on: ${getAbsoluteUrlPath(app, specPath, specFileName)}`
  );

  setupDefinitionApis(definition, app);

  setupDefinitionApisSpec(definition, app, path.join(specOutputFolder, specFileName));
}

export function setupDefinitionApis(def: Definition, app: Express) {
  def.apis.forEach((api) => {
    buildEndpointConfig(def, api.entrypoints).forEach((epc) =>
      registerServerEndpoint(app, epc, api.path)
    );
  });
}

/** Create API OpenAPI spec from definition */
function setupDefinitionApisSpec(definition: Definition, app: Express, outputFile: string) {
  const config = getAppContext(app).config;

  const openApi = buildOpenAPI(definition, config.basePath);

  saveOutputFile(outputFile, JSON.stringify(openApi, undefined, 2));

  setupEntrypointApiSwagger(openApi, app);
}

function setupEntrypointApiSwagger(openApiDocument: OpenAPIV3.Document, app: Express) {
  const swaggerPath = `/api-docs`;

  app.use(swaggerPath, serve, (_req: Request, _resp: Response, _next: NextFunction) =>
    setup(openApiDocument)(_req, _resp, _next)
  );
  logger.info(`registered OpenAPI Swagger on: ${getAbsoluteUrlPath(app, swaggerPath)}`);
}
/** Register endpoint on server instance */
export function registerServerEndpoint(app: Express, epConfig: EndpointConfig, pathPrefix: string) {
  const epPath = pathPrefix + epConfig.path;
  logger.info(`registering endpoint: ${epConfig.method.toUpperCase()} ${epPath}`);

  app[epConfig.method](
    epPath,
    endpointGuardHandler(async (req, resp, next) => {
      // we have to manually chain (await) our handlers since express' `next` can't do it for us (it's sync)
      for (const h of epConfig.handlers) {
        await h(req, resp, next);
      }
    })
  );
}

function getAbsoluteUrlPath(app: Express, ...paths: string[]): string {
  const config = getAppContext(app).config;

  return [config.basePath ?? "", ...paths].join("");
}
