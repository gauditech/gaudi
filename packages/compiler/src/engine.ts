#!/usr/bin/env node

// import this file only with relative path because this file actually configures path aliases (eg @src, ...)
import "./common/setupAliases";

import { build } from "@compiler/builder/builder";
import { compileProject } from "@compiler/compiler";
import { compose } from "@compiler/composer/composer";
import { readConfig } from "@compiler/config";

const { inputFolder, outputFolder, gaudiFolder } = readConfig();

const definition = compose(compileProject(inputFolder));

build(definition, { outputFolder, gaudiFolder });
