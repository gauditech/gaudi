import { composeEntrypoints } from "./entrypoints";
import { composeModels } from "./models";

import { composeAuthenticator } from "@src/composer/authenticator";
import { composeExecutionRuntimes } from "@src/composer/executionRuntimes";
import { composeGenerators } from "@src/composer/generators";
import { composePopulators } from "@src/composer/populators";
import { Definition } from "@src/types/definition";
import { Specification } from "@src/types/specification";

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
