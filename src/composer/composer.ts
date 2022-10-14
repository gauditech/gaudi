import { composeEntrypoints } from "./entrypoints";
import { composeModels } from "./models";

import { Definition } from "@src/types/definition";
import { Specification } from "@src/types/specification";

export function compose(input: Specification): Definition {
  const models = composeModels(input.models);
  const entrypoints = composeEntrypoints(models, input.entrypoints);
  return {
    models,
    entrypoints,
  };
}
