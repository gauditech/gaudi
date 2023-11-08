import { initLogger } from "@gaudi/compiler";
import { Definition, PopulateDef, PopulatorDef } from "@gaudi/compiler/dist/types/definition";
import _ from "lodash";

import { executeActions } from "@runtime/common/action";
import { createIterator } from "@runtime/common/iterator";
import { RuntimeConfig, loadDefinition } from "@runtime/config";
import { GlobalContext, initializeContext } from "@runtime/server/context";
import { DbConn, createDbConn } from "@runtime/server/dbConn";

const logger = initLogger("gaudi:populator");

/** Main runner. */
export async function populate(options: PopulateOptions, config: RuntimeConfig) {
  let dbConn: DbConn | undefined;
  try {
    const definition = loadDefinition(config.definitionPath);

    dbConn = createDbConn(config.dbConnUrl);

    const targetPopulatorName = options.populator;

    if (targetPopulatorName == null) {
      throw new Error(`Populator name is missing. Try adding "-p <name>"`);
    }

    const populator: PopulatorDef | undefined = definition.populators.find(
      (p) => p.name === targetPopulatorName
    ); // take simply the first one

    if (populator == null) {
      throw new Error(`Populator "${targetPopulatorName}" not found`);
    }

    logger.debug(`Running populator ${populator.name}`);

    const ctx = initializeContext({});

    // wrap entire populator process in a single transaction
    await dbConn.transaction(async (tx) => {
      await processPopulator(definition, tx, ctx, populator);
    });
  } finally {
    // clear connection
    await dbConn?.destroy();
  }
}

export type PopulateOptions = {
  /** Name of the populator to execute */
  populator?: string;
};

async function processPopulator(
  def: Definition,
  dbConn: DbConn,
  ctx: GlobalContext,
  populator: PopulatorDef
) {
  for (const p of populator.populates) {
    await processPopulate(def, dbConn, ctx, p);
  }
}

async function processPopulate(
  def: Definition,
  dbConn: DbConn,
  ctx: GlobalContext,
  populate: PopulateDef
) {
  const repeater = populate.repeater;
  const repeaterAlias = repeater.alias;
  const iterator = createIterator(repeater.start, repeater.end);

  for (const iter of iterator) {
    // each iteration has it's own context which prepopulated from parent context
    // by having it's own context iteration can override parent values without tinkering with parent's context
    const actionCtx = _.cloneDeep(ctx);

    // add repeater to new context
    if (repeaterAlias) {
      // add only readonly props so other populates/setters/hooks/... cannot mess with iterator state
      _.set(actionCtx.aliases, repeaterAlias, {
        current: iter.current,
        total: iter.total,
      });
    }

    await executeActions(def, dbConn, actionCtx, populate.actions);

    for (const p of populate.populates) {
      await processPopulate(def, dbConn, actionCtx, p);
    }
  }
}
