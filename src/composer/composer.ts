import { composeEntrypoints } from "./entrypoints.js";
import { composeModels } from "./models.js";

import { composeAuthenticator } from "@src/composer/authenticator.js";
import { composeExecutionRuntimes } from "@src/composer/executionRuntimes.js";
import { composeGenerators } from "@src/composer/generators.js";
import { composePopulators } from "@src/composer/populators.js";
import { Definition } from "@src/types/definition.js";
import { Specification } from "@src/types/specification.js";

export function compose(input: Specification): Definition {
  // let's start with empty definition
  // sub-composers are expected to mutate it
  const def: Definition = {
    models: [],
    entrypoints: [],
    resolveOrder: [],
    populators: [],
    runtimes: [],
    authenticator: undefined,
    generators: [],
  };

  // runtimes can be composed first because they don't have external deps
  composeExecutionRuntimes(def, input.runtimes);
  composeModels(def, input, input.models);
  composeAuthenticator(def, input.authenticator);
  composeEntrypoints(def, input.entrypoints);
  composePopulators(def, input.populators);
  composeGenerators(def, input.generators);

  return def;
}
