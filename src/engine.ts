#!/usr/bin/env node

// import this file only with relative path because this file actually configures path aliases (eg @src, ...)
import "./common/setupAliases";

import { sync } from "fast-glob";

import { compileWorkspace } from "./compiler";

import { build, compose } from "./index";

import { readConfig } from "@src/config";

const { inputPath, outputFolder, gaudiFolder } = readConfig();

const filenames = sync(inputPath);
if (!filenames.length) {
  throw new Error(`No files found matching: "${inputPath}"`);
}

const specification = compileWorkspace(filenames);
const definition = compose(specification);
build(definition, { outputFolder, gaudiFolder });
