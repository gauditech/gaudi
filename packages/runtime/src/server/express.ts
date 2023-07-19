import { Router } from "express";

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
 * @returns Express router
 *
 */
export function useGaudi(config: AppConfig) {
  // initialize new router
  const router = Router();

  const definition = loadDefinition(config.definitionPath);

  gaudiMiddleware(router, definition, config);

  return router;
}
