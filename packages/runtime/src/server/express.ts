import express, { Router } from "express";

import { AppConfig, loadDefinition } from "@runtime/config";
import { gaudiMiddleware } from "@runtime/server/middleware";

// router singleton
let router: express.Router;

/**
 * Gaudi express middleware. Initializes Gaudi API and error handlers.
 *
 * Usage:
 * Gaudi in root path:
 * ```
 * app.use(useGaudi())
 * ```
 *
 * Gaudi in subpath path:
 * ```
 * app.use("/subpath", useGaudi())
 * ```
 *
 * @param customConfig {AppConfig} - manual config; if not provided, Gaudi reads config from ENV
 * @returns - express router
 */
export function useGaudi(config: AppConfig) {
  // initialize new router
  router = Router();

  const definition = loadDefinition(config.definitionPath);

  gaudiMiddleware(router, definition, config);

  return router;
}
