import fs from "fs";
import path from "path";

import {
  BUILDER_OPENAPI_SPEC_FILE_NAME,
  BUILDER_OPENAPI_SPEC_FOLDER,
} from "@gaudi/compiler/dist/builder/builder";
import { Logger } from "@gaudi/compiler/dist/common/logger";
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

  const specFolderOutputPath = path.join(config.outputFolder, BUILDER_OPENAPI_SPEC_FOLDER);
  const specFileOutputPath = path.join(specFolderOutputPath, BUILDER_OPENAPI_SPEC_FILE_NAME);

  // --- static folder for serving API specs
  app.use(`/${BUILDER_OPENAPI_SPEC_FOLDER}`, staticHandler(specFolderOutputPath));
  logger.info(
    `registered OpenAPI specification on: ${getAbsoluteUrlPath(
      app,
      BUILDER_OPENAPI_SPEC_FOLDER,
      BUILDER_OPENAPI_SPEC_FILE_NAME
    )}`
  );

  setupDefinitionApis(definition, app);

  setupDefinitionApisSpec(definition, app, specFileOutputPath);
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
  const openApiSpecContent = loadFile(outputFile);

  const openApiSpec = JSON.parse(openApiSpecContent);

  setupEntrypointApiSwagger(openApiSpec, app);
}

function setupEntrypointApiSwagger(openApiDocument: OpenAPIV3.Document, app: Express) {
  const swaggerPath = `/api-docs`;

  app.use(swaggerPath, serve, (req: Request, resp: Response, next: NextFunction) =>
    setup(openApiDocument)(req, resp, next)
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

/** Load file content */
export function loadFile(filePath: string): string {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: "${filePath}"`);
  }
  return fs.readFileSync(filePath).toString("utf-8");
}
