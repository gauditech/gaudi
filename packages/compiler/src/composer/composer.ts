import { composeApis } from "./entrypoints";
import { composeModels } from "./models";

import { composeAuthenticator } from "@compiler/composer/authenticator";
import { composeExecutionRuntimes } from "@compiler/composer/executionRuntimes";
import { composeGenerators } from "@compiler/composer/generators";
import { composePopulators } from "@compiler/composer/populators";
import { composeValidators } from "@compiler/composer/validators";
import { Definition } from "@compiler/types/definition";
import { Specification } from "@compiler/types/specification";

export function compose(input: Specification): Definition {
  // let's start with empty definition
  // sub-composers are expected to mutate it
  const def: Definition = {
    validators: [],
    models: [],
    apis: [],
    populators: [],
    runtimes: [],
    authenticator: undefined,
    generators: [],
  };

  // runtimes can be composed first because they don't have external deps
  composeExecutionRuntimes(def, input.runtimes);
  composeValidators(def, input.validators);
  composeModels(def, input.models);
  composeAuthenticator(def, input.authenticator);
  composeApis(def, input.apis);
  composePopulators(def, input.populators);
  composeGenerators(def, input.generators);

  return def;
}
