#!/usr/bin/env node

// import this file only with relative path because this file actually configures path aliases (eg @src, ...)
import "./common/setupAliases";

import { build } from "@src/builder/builder";
import { compileProject } from "@src/compiler";
import { compose } from "@src/composer/composer";
import { readConfig } from "@src/config";

const { inputFolder, outputFolder, gaudiFolder } = readConfig();

const definition = compose(compileProject(inputFolder));

build(definition, { outputFolder, gaudiFolder });
