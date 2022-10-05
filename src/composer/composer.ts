import { composeModels } from "./models";

import { Definition } from "@src/types/definition";
import { Specification } from "@src/types/specification";

export function compose(input: Specification): Definition {
  const models = composeModels(input.models);
  return {
    models,
  };
}
