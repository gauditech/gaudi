import express from "express";
import _ from "lodash";

import { AppConfig, loadDefinition } from "@runtime/config";
import { gaudiMiddleware } from "@runtime/server/middleware";

/**
 * Gaudi express middleware.
 * Loads definition file, initializes Gaudi APIs and error handlers.
 *
 * Example usage:
 *
 * Gaudi in root path:
 * ```
 * app.use(useGaudi())
 * ```
 *
 * Gaudi in subpath:
 * ```
 * app.use("/subpath", useGaudi())
 * ```
 *
 * @param config {AppConfig} - Gaudi runtime config
 * @returns Express instance
 *
 */
export function useGaudi(config: AppConfig) {
  // initialize new subapp for gaudi
  const app = express();

  const definition = loadDefinition(config.definitionPath);

  gaudiMiddleware(app, definition, config);

  return app;
}
