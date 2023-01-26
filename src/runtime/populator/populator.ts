#!/usr/bin/env node

// import this file only with relative path because this file actually configures path aliases (eg @src, ...)
import "../../common/setupAliases";

import _ from "lodash";

import { ActionContext, executeActions } from "@src/runtime/common/action";
import { createIterator } from "@src/runtime/common/iterator";
import { RuntimeConfig, loadDefinition, readConfig } from "@src/runtime/config";
import { DbConn, createDbConn } from "@src/runtime/server/dbConn";
import { Vars } from "@src/runtime/server/vars";
import { Definition, PopulateDef, PopulatorDef } from "@src/types/definition";

// read environment
const config = readConfig();
const args = readArgs();

// run main function
run(args, config);

// ------------------------

/** Main runner. */
async function run(args: ProcessArgs, config: RuntimeConfig) {
  let dbConn: DbConn | undefined;
  try {
    const definition = loadDefinition(config.definitionPath);

    dbConn = createDbConn(config.dbConnUrl, { schema: config.dbSchema });

    const targetPopulatorName = args.populator;

    if (targetPopulatorName == null) {
      throw new Error(`Populator name is missing. Try adding "-p <name>"`);
    }

    const populator: PopulatorDef | undefined = definition.populators.find(
      (p) => p.name === targetPopulatorName
    ); // take simply the first one

    if (populator == null) {
      throw new Error(`Populator "${targetPopulatorName}" not found`);
    }

    console.log(`Running populator ${populator.name}`);

    const targetCtx: ActionContext = { input: {}, vars: new Vars(), referenceIds: [] };

    // wrap entire populator process in a single transaction
    await dbConn.transaction(async (tx) => {
      await processPopulator(definition, tx, targetCtx, populator);
    });
  } finally {
    // clear connection
    await dbConn?.destroy();
  }
}

type ProcessArgs = {
  /** Name of the populator to execute */
  populator?: string;
};

/**
 * Simple process argument parser.
 *
 * This avoids using positional parameters.
 * For CLI we sohuld think about introducing some better arg parser.
 */
function readArgs(): ProcessArgs {
  const rawArgs = process.argv.slice(2); // skip node and this script

  const args: ProcessArgs = {};
  while (rawArgs.length) {
    const a = rawArgs.shift();
    if (a === "-p") {
      args.populator = rawArgs.shift();
    } else {
      console.log(`Unknown argument ${a}`);
    }
  }

  return args;
}

async function processPopulator(
  def: Definition,
  dbConn: DbConn,
  ctx: ActionContext,
  populator: PopulatorDef
) {
  for (const p of populator.populates) {
    await processPopulate(def, dbConn, ctx, p);
  }
}

async function processPopulate(
  def: Definition,
  dbConn: DbConn,
  ctx: ActionContext,
  populate: PopulateDef
) {
  const repeater = populate.repeater;
  const repeaterAlias = repeater.alias;
  const iterator = createIterator(repeater.start, repeater.end);

  for (const iter of iterator) {
    // each iteration has it's own context which prepopulated from parent context
    // by having it's own context iteration can override parent values without tinkering with parent's context
    const actionCtx = createNewCtx(ctx);

    // add repeater to new context
    if (repeaterAlias) {
      // add only readonly props so other populates/setters/hooks/... cannot mess with iterator state
      actionCtx.vars.set(repeaterAlias, {
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

/**
 * Create new context from an existing one or a new, empty one.
 *
 * Context `input` is copies since it's an external data,
 * but `vars` is copied to a new instance.
 */
function createNewCtx(ctx: ActionContext): ActionContext {
  return { input: ctx.input, vars: ctx.vars?.copy() ?? new Vars(), referenceIds: ctx.referenceIds };
}