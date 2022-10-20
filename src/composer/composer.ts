import { composeEntrypoints } from "./entrypoints";
import { composeModels } from "./models";

import { Definition } from "@src/types/definition";
import { Specification } from "@src/types/specification";

export function compose(input: Specification): Definition {
  // let's start with empty definition
  // sub-composers are expected to mutate it
  const def: Definition = { models: [], entrypoints: [] };
  composeModels(def, input.models);
  composeEntrypoints(def, input.entrypoints);
  return def;
}
