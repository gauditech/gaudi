import { EngineConfig } from "@gaudi/compiler/dist/config";
import _ from "lodash";

import { GAUDI_SCRIPTS, getDefaultNodeOptions } from "@cli/config";
import { createCommandRunner } from "@cli/runner";
import { makeCliSafePath } from "@cli/utils";

// --- compile

export function compile(_config: EngineConfig) {
  console.log("Compiling Gaudi blueprint ...");

  return createCommandRunner("node", [
    ...getDefaultNodeOptions(),
    makeCliSafePath(GAUDI_SCRIPTS.COMPILER),
  ]);
}
