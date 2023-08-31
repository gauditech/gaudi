import fs from "fs";
import path from "path";

import { initLogger } from "@gaudi/compiler";
import {
  BUILDER_OPENAPI_SPEC_FILE_NAME,
  BUILDER_OPENAPI_SPEC_FOLDER,
} from "@gaudi/compiler/dist/builder/builder";
import { kindFind } from "@gaudi/compiler/dist/common/kindFilter";
import { concatUrlFragments } from "@gaudi/compiler/dist/common/utils";
import { Definition } from "@gaudi/compiler/dist/types/definition";
import cors from "cors";
import { Express, NextFunction, Request, Response, static as staticHandler } from "express";
import { OpenAPIV3 } from "openapi-types";
import { serve, setup } from "swagger-ui-express";

import { getAppContext } from "@runtime/server/context";
import { buildEndpointConfig } from "@runtime/server/endpoints";
import { endpointGuardHandler } from "@runtime/server/middleware";
import { EndpointConfig } from "@runtime/server/types";

const logger = initLogger("gaudi:runtime:api");

/** Create endpoint handlers, OpenAPI specs and attach them to server instance */
export function setupServerApis(definition: Definition, app: Express) {
  setupDefinitionApis(definition, app);

  setupDefinitionApisSpec(definition, app);
}

export function setupDefinitionApis(def: Definition, app: Express) {
  def.apis.forEach((api) => {
    // add CORS for API route
    if (api.cors) {
      const corsConfig = {
        origin: api.cors.origin,
      };

      logger.debug(`Applying CORS config to route "${api.path}":`, corsConfig);

      app.use(api.path, cors(corsConfig));
    }

    buildEndpointConfig(def, api.entrypoints).forEach((epc) =>
      registerServerEndpoint(app, epc, api.path)
    );
  });
}

/** Create API OpenAPI spec from definition */
function setupDefinitionApisSpec(definition: Definition, app: Express) {
  // setup apispec only if generator exists
  const apidocsGenerator = kindFind(definition.generators, "generator-apidocs");
  // setup only if generator exists
  if (!apidocsGenerator) return;

  const config = getAppContext(app).config;

  const specFolderOutputPath = path.join(config.outputFolder, BUILDER_OPENAPI_SPEC_FOLDER);
  const specFileOutputPath = path.join(specFolderOutputPath, BUILDER_OPENAPI_SPEC_FILE_NAME);

  // --- static folder for serving API specs
  app.use(`/${BUILDER_OPENAPI_SPEC_FOLDER}`, staticHandler(specFolderOutputPath));
  logger.debug(
    `registered OpenAPI specification on: ${concatUrlFragments(
      BUILDER_OPENAPI_SPEC_FOLDER,
      BUILDER_OPENAPI_SPEC_FILE_NAME
    )}`
  );

  const openApiSpecContent = loadFile(specFileOutputPath);

  const openApiSpec = JSON.parse(openApiSpecContent);

  setupEntrypointApiSwagger(openApiSpec, app);
}

function setupEntrypointApiSwagger(openApiDocument: OpenAPIV3.Document, app: Express) {
  const swaggerPath = `/api-docs`;

  app.use(swaggerPath, serve, (req: Request, resp: Response, next: NextFunction) =>
    setup(openApiDocument)(req, resp, next)
  );
  logger.debug(`registered OpenAPI Swagger on: ${concatUrlFragments(swaggerPath)}`);
}
/** Register endpoint on server instance */
export function registerServerEndpoint(app: Express, epConfig: EndpointConfig, pathPrefix: string) {
  const epPath = pathPrefix + epConfig.path;
  logger.debug(`registering endpoint: ${epConfig.method.toUpperCase()} ${epPath}`);

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

/** Load file content */
export function loadFile(filePath: string): string {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: "${filePath}"`);
  }
  return fs.readFileSync(filePath).toString("utf-8");
}
