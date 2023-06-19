#!/usr/bin/env node

// import this file only with relative path because this file actually configures path aliases (eg @src, ...)
import "./common/setupAliases";

import fs from "fs";

import { build, compileToOldSpec, compose } from "./index";

import { readConfig } from "@src/config";

const { inputPath, outputFolder, gaudiFolder } = readConfig();

// gaudi engine currently reads from 1 specified file
if (!fs.existsSync(inputPath) || !fs.lstatSync(inputPath).isFile()) {
  throw new Error(`Gaudi engine input file not found: "${inputPath}"`);
}

console.log(`Reading Gaudi source from: "${inputPath}"`);

const input = fs.readFileSync(inputPath).toString("utf-8");
const specification = compileToOldSpec(input);
const definition = compose(specification);
build(definition, { outputFolder, gaudiFolder });
