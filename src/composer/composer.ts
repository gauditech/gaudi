import _ from "lodash";

import { composeEntrypoints } from "./entrypoints";
import { composeModels } from "./models";
import { composeQuery } from "./query";

import { getRef } from "@src/common/refs";
import { composeAuthenticator } from "@src/composer/authenticator";
import { composeExecutionRuntimes } from "@src/composer/executionRuntimes";
import { composeGenerators } from "@src/composer/generators";
import { composePopulators } from "@src/composer/populators";
import { Definition } from "@src/types/definition";
import { QuerySpec, Specification } from "@src/types/specification";

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
    views: [],
  };

  // runtimes can be composed first because they don't have external deps
  composeExecutionRuntimes(def, input.runtimes);
  composeModels(def, input, input.models);
  composeAuthenticator(def, input.authenticator);
  composeEntrypoints(def, input.entrypoints);
  composePopulators(def, input.populators);
  composeGenerators(def, input.generators);
  composeQueryViews(def, input.views ?? []);

  return def;
}

function composeQueryViews(def: Definition, views: QuerySpec[]) {
  const qviews = views.map((view) => {
    const model = getRef.model(def, view.fromModel[0]);
    return composeQuery(def, model, view, {});
  });
  def.views = qviews;
}
