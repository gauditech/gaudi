import { composeEntrypoints } from "./entrypoints";
import { composeModels } from "./models";

import { compileAuthenticatorSpec, composeAuthenticator } from "@src/composer/authenticator";
import { composeExecutionRuntimes } from "@src/composer/executionRuntimes";
import { composePopulators } from "@src/composer/populators";
import { Definition } from "@src/types/definition";
import { Specification } from "@src/types/specification";

export function compose(input: Specification): Definition {
  const mergedSpecs = mergePredefinedSpecs(input);

  // let's start with empty definition
  // sub-composers are expected to mutate it
  const def: Definition = {
    models: [],
    entrypoints: [],
    resolveOrder: [],
    populators: [],
    runtimes: [],
    authenticator: undefined,
  };

  // runtimes can be composed first because they don't have external deps
  composeExecutionRuntimes(def, mergedSpecs.runtimes);
  composeModels(def, mergedSpecs, mergedSpecs.models);
  composeAuthenticator(def, mergedSpecs.authenticator);
  composeEntrypoints(def, mergedSpecs.entrypoints);
  composePopulators(def, mergedSpecs.populators);

  return def;
}

/**
 * Takes specifications injected from various Gaudi features (eg. authentication)
 * and merges them with user input spec.
 */
function mergePredefinedSpecs(input: Specification): Specification {
  const predefinedSpecs = [
    // authenticator specs
    compileAuthenticatorSpec(input.authenticator),
  ];

  return predefinedSpecs.reduce((accum: Specification, spec: Specification) => {
    return {
      models: [...accum.models, ...spec.models],
      entrypoints: [...accum.entrypoints, ...spec.entrypoints],
      populators: [...accum.populators, ...spec.populators],
      runtimes: [...accum.runtimes, ...spec.runtimes],
      authenticator: spec.authenticator ?? accum.authenticator,
    };
  }, input);
}
