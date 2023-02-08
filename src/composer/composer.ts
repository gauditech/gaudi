import { composeEntrypoints } from "./entrypoints";
import { composeModels } from "./models";

import { composeAuthenticator, createAuthenticatorModelSpec } from "@src/composer/authenticator";
import { composePopulators } from "@src/composer/populators";
import { Definition } from "@src/types/definition";
import { ModelSpec, Specification } from "@src/types/specification";

export function compose(input: Specification): Definition {
  // let's start with empty definition
  // sub-composers are expected to mutate it
  const def: Definition = { models: [], entrypoints: [], resolveOrder: [], populators: [] };

  // collect models injected from other sources together with main models
  const models: ModelSpec[] = [
    ...input.models,
    ...createAuthenticatorModelSpec(input.authenticator),
  ];
  composeModels(def, models, input.authenticator);
  composeAuthenticator(def, input.authenticator);
  composeEntrypoints(def, input.entrypoints);
  composePopulators(def, input.populators);

  return def;
}
