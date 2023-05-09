#!/usr/bin/env node

// import this file only with relative path because this file actually configures path aliases (eg @src, ...)
import "./common/setupAliases";

import fs from "fs";

import { build, compileToOldSpec, compose } from "./index.js";

import { readConfig } from "@src/config.js";

const { inputPath, outputFolder, gaudiFolder } = readConfig();

if (!fs.existsSync(inputPath)) {
  throw new Error(`Gaudi engine input file not found: "${inputPath}"`);
}

const input = fs.readFileSync(inputPath).toString("utf-8");
const specification = compileToOldSpec(input);
const definition = compose(specification);
build(definition, { outputFolder, gaudiFolder });
