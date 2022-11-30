// import this file only with relative path because this file actually configures path aliases (eg @src, ...)
import "../../common/setupAliases";

import { getRef } from "@src/common/refs";
import { RuntimeConfig, loadDefinition, readConfig } from "@src/runtime/config";
import { Vars } from "@src/runtime/server/vars";
import { Definition, ModelDef, PopulateDef, PopulatorDef } from "@src/types/definition";

// read environment
const config = readConfig();

run(config);

function run(config: RuntimeConfig) {
  const definition = loadDefinition(config.definitionPath);

  // TODO: take populator by name from config
  const populator: PopulatorDef = definition.populators[0]; // take simply the first one

  processPopulator(definition.models, new Vars(), populator);
}

function processPopulator(models: ModelDef[], ctx: Vars, populator: PopulatorDef) {
  populator.populates.forEach((p) => processPopulate(models, p));
}

async function processPopulate(models: ModelDef[], populate: PopulateDef) {
  const model = getRef<"model">(models, populate.target.refKey);
  const targetAlias = populate.target.alias;
  const repeater = populate.repeat;
  const repeaterAlias = populate.repeat.alias;

  const iterator = createIterator(repeater);
  while (iterator.hasNext()) {
    const ctx = createNewCtx(parentCtx, populate);

    if (repeaterAlias) {
      ctx.set(repeaterAlias, { current: iterator.current, total: iterator.total });
    }
    if (targetAlias) {
      ctx.set(targetAlias, data);
    }

    const data = changesetToData(ctx, populate.changeset);
    const result = await insertChangesetData(def, dbConn, model, data);

    if (targetAlias) {
      ctx.set(targetAlias, result);
    }

    populate.populates.forEach((p) => processPopulate(ctx, p));

    iterator.next();
  }
}
