// import this file only with relative path because this file actually configures path aliases (eg @src, ...)
import "../../common/setupAliases";

import _ from "lodash";

import { dataToFieldDbnames, getRef } from "@src/common/refs";
import { buildChangset } from "@src/runtime/common/changeset";
import { RuntimeConfig, loadDefinition, readConfig } from "@src/runtime/config";
import { DbConn, createDbConn } from "@src/runtime/server/dbConn";
import { Vars } from "@src/runtime/server/vars";
import { ModelDef, PopulateDef, PopulateRepeatDef, PopulatorDef } from "@src/types/definition";

type PopulatorIterator = {
  current: number;
  total: number;
  next: () => number;
  hasNext: () => boolean;
};

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

    // wrap entire populator proces in a single transaction
    await dbConn.transaction(async (tx) => {
      const targetPopulatorName = args.populator;

      if (targetPopulatorName == null) {
        throw new Error(`Populator name not defined`);
      }

      const populator: PopulatorDef | undefined = definition.populators.find(
        (p) => p.name === targetPopulatorName
      ); // take simply the first one

      if (populator == null) {
        throw new Error(`Populator definition "${targetPopulatorName}" not found`);
      }

      console.log(`Running populator ${populator.name}`);

      await processPopulator(definition.models, tx, createNewCtx(), populator);
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
  models: ModelDef[],
  dbConn: DbConn,
  ctx: Vars,
  populator: PopulatorDef
) {
  for (const p of populator.populates) {
    await processPopulate(models, dbConn, ctx, p);
  }
}

async function processPopulate(
  models: ModelDef[],
  dbConn: DbConn,
  parentCtx: Vars,
  populate: PopulateDef
) {
  const model = getRef<"model">(models, populate.target.retType).value;
  const targetAlias = populate.target.alias;
  const repeater = populate.repeat;
  const repeaterAlias = populate.repeat.alias;

  const iterator = createIterator(repeater);
  while (iterator.hasNext()) {
    // each iteration has it's own context which prepopulated from parent context
    // by having it's own context iteration can override parent values without tinkering with parent's context
    const ctx = createNewCtx(parentCtx);

    // add repeater to new context
    if (repeaterAlias) {
      // add only readonly props so other populates/setters/hooks/... cannot mess with iterator state
      ctx.set(repeaterAlias, { current: iterator.current, total: iterator.total });
    }

    // changesets are used in actions as well but we don't have input object here
    const data = buildChangset(populate.changeset, { input: {}, vars: ctx });

    const result = await insertChangesetData(dbConn, model, data);

    // add insert result to context (eg. to be available to child populates)
    if (targetAlias) {
      ctx.set(targetAlias, result);
    }

    for (const p of populate.populates) {
      await processPopulate(models, dbConn, ctx, p);
    }

    iterator.next();
  }
}

/** Create new context from an existing one or a new, empty one. */
function createNewCtx(parentCtx?: Vars) {
  return parentCtx?.copy() ?? new Vars();
}

/** Create iterator object to be used in populate iterations. */
function createIterator(repeater: PopulateRepeatDef): PopulatorIterator {
  let current = 1;
  const total = repeater.max - repeater.min + 1;

  return {
    current,
    total,
    next: () => current++,
    hasNext: () => current <= total,
  };
}

/**
 * Execute DB insert.
 *
 * TODO: could we extract or reuse this from another file?
 */
async function insertChangesetData(
  dbConn: DbConn,
  model: ModelDef,
  data: Record<string, string | number | boolean | null>
) {
  const ret = await dbConn
    .insert(dataToFieldDbnames(model, data))
    .into(model.dbname)
    .returning("*");

  if (!ret.length) return null;

  return ret[0];
}
