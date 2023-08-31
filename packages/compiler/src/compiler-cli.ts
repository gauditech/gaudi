#!/usr/bin/env node

import { build } from "@compiler/builder/builder";
import { compileProject } from "@compiler/compiler";
import { compose } from "@compiler/composer/composer";
import { readConfig } from "@compiler/config";

const { inputDirectory, outputDirectory, gaudiDirectory } = readConfig();

const definition = compose(compileProject(inputDirectory));

const provider = process.env.USE_SQLITE ? "sqlite" : "postgresql";
build(definition, { outputDirectory, gaudiDirectory, dbProvider: provider });
