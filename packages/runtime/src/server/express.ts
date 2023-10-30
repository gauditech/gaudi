import express, { Express, Router } from "express";
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
 * @param config Gaudi runtime config
 * @param extra Additional express app or router instance that will be injected between Gaudi's middleware and endpoints. This can a place for injecting additional processing middleware or middleware (e.g. authentication).
 *
 * @returns Express instance
 */
export function useGaudi(config: AppConfig, extra?: Express | Router) {
  // initialize new subapp for gaudi
  const app = express();

  const definition = loadDefinition(config.definitionPath);

  gaudiMiddleware(app, definition, config, extra);

  return app;
}
