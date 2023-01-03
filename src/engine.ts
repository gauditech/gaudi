#!/usr/bin/env node

// import this file only with relative path because this file actually configures path aliases (eg @src, ...)
import "./common/setupAliases";

import fs from "fs";

import { build, compile, compose, parse } from "./index";

import { readConfig } from "@src/config";

const { inputPath, outputFolder, gaudiFolder } = readConfig();

if (!fs.existsSync(inputPath)) {
  throw new Error(`Gaudi engine input file not found: "${inputPath}"`);
}

const input = fs.readFileSync(inputPath).toString("utf-8");
const ast = parse(input);
const specification = compile(ast);
const definition = compose(specification);
build(definition, { outputFolder, gaudiFolder });
