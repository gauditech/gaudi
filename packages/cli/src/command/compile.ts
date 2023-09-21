import { EngineConfig } from "@gaudi/compiler/dist/config";
import _ from "lodash";

import { createCommandRunner } from "@cli/runner";

// --- compile

export function compile(_config: EngineConfig) {
  console.log("Compiling Gaudi code ...");

  return createCommandRunner("npx", ["gaudi-compiler"], { commandName: "compile" });
}
