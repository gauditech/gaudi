#!/usr/bin/env node

import { configDotenv } from "dotenv";
import _ from "lodash";

import { readConfig } from "@runtime/config";
import { PopulateOptions, populate } from "@runtime/populator/populator";

// read ".env" file form cwd
configDotenv({});

// read cofig
const config = readConfig();

// read CLI args
const args = readArgs();

// run main function
populate(args, config);

/**
 * Simple process argument parser.
 *
 * This avoids using positional parameters.
 * For CLI we should think about introducing some better arg parser.
 */
function readArgs(): PopulateOptions {
  const rawArgs = process.argv.slice(2); // skip node and this script

  const args: PopulateOptions = {};
  while (rawArgs.length) {
    const a = rawArgs.shift();
    if (a === "-p") {
      args.populator = rawArgs.shift();
    } else {
      console.error(`Unknown argument ${a}`);
    }
  }

  return args;
}
