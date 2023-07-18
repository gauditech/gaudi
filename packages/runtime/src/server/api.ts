import path from "path";

import { buildOpenAPI } from "@gaudi/compiler/dist/builder/openAPI";
import { saveOutputFile } from "@gaudi/compiler/dist/common/utils";
import { Definition } from "@gaudi/compiler/dist/types/definition";
import { NextFunction, Request, Response, Router, static as staticHandler } from "express";
import { OpenAPIV3 } from "openapi-types";
import { serve, setup } from "swagger-ui-express";

import { getAppContext } from "@runtime/server/context";
import { buildEndpointConfig, registerServerEndpoint } from "@runtime/server/endpoints";

/** Create endpoint handlers, OpenAPI specs and attach them to server instance */
export function setupServerApis(definition: Definition, app: Router) {
  const config = getAppContext(app).config;

  // --- static folder (eg. for API specs)
  const specOutputFolder = path.join(config.outputFolder, "api-spec");
  app.use("/api-spec", staticHandler(specOutputFolder));

  setupDefinitionApis(definition, app);

  setupDefinitionApisSpec(definition, app, path.join(specOutputFolder, "api.openapi.json"));
}

export function setupDefinitionApis(def: Definition, app: Router) {
  def.apis.forEach((api) => {
    buildEndpointConfig(def, api.entrypoints).forEach((epc) =>
      registerServerEndpoint(app, epc, api.path)
    );
  });
}

/** Create API OpenAPI spec from definition */
function setupDefinitionApisSpec(definition: Definition, app: Router, outputFile: string) {
  const openApi = buildOpenAPI(definition);

  saveOutputFile(outputFile, JSON.stringify(openApi, undefined, 2));

  setupEntrypointApiSwagger(openApi, app);
}

function setupEntrypointApiSwagger(openApiDocument: OpenAPIV3.Document, app: Router) {
  const swaggerPath = `/api-docs`;

  app.use(swaggerPath, serve, (_req: Request, _resp: Response, _next: NextFunction) =>
    setup(openApiDocument)(_req, _resp, _next)
  );
}
