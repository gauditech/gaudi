import { composeEntrypoints } from "./entrypoints";
import { composeModels } from "./models";

import { composeExecutionRuntimes } from "@src/composer/executionRuntimes";
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
  };
  composeModels(def, input.models);
  composeEntrypoints(def, input.entrypoints);
  composePopulators(def, input.populators);
  composeExecutionRuntimes(def, input.runtimes);

  return def;
}
