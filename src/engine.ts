// import this file only with relative path because this file actually configures path aliases (eg @src, ...)
import "./common/setupAliases";

import fs from "fs";
import path from "path";

import * as fse from "fs-extra";

import { build, compile, compose, parse } from "./index";

import { readConfig } from "@src/config";

const { inputPath, inputHooksPath, outputPath } = readConfig();

if (!fs.existsSync(inputPath)) {
  throw new Error(`Gaudi engine input file not found: "${inputPath}"`);
}

const input = fs.readFileSync(inputPath).toString("utf-8");
const ast = parse(input);
const specification = compile(ast);
const definition = compose(specification);
build(definition, outputPath);

async function buildHooks(): Promise<void> {
  const outputHooksPath = path.join(outputPath, "hooks");
  await fse.remove(outputHooksPath);
  await fse.copy(inputHooksPath, outputHooksPath);
}

buildHooks();
