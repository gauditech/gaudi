#!/usr/bin/env node

// import this file only with relative path because this file actually configures path aliases (eg @src, ...)
import "./common/setupAliases";

import { compileProject } from "./compiler";

import { build } from "./index";

import { readConfig } from "@src/config";

const { inputFolder, outputFolder, gaudiFolder } = readConfig();

const definition = compileProject(inputFolder);
build(definition, { outputFolder, gaudiFolder });
