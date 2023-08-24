#!/usr/bin/env node

import { build } from "@compiler/builder/builder";
import { compileProject } from "@compiler/compiler";
import { compose } from "@compiler/composer/composer";
import { readConfig } from "@compiler/config";

const { inputFolder, outputFolder, gaudiFolder } = readConfig();

const definition = compose(compileProject(inputFolder));

const provider = process.env.USE_SQLITE ? "sqlite" : "postgresql";
build(definition, { outputFolder, gaudiFolder, dbProvider: provider });
