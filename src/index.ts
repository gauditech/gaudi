import fs from "fs";

import "./common/setupAliases";
// import definitionInput from "@examples/git/definition.json";
// import specificationInput from "@examples/git/specification.json";

import { build } from "@src/builder/builder";
import { compile } from "@src/compiler/compiler";
import { compose } from "@src/composer/composer";
import { parse } from "@src/parser/parser";

const blueprintPath = "../examples/git/blueprint.gaudi";

const input = fs.readFileSync(blueprintPath).toString("utf-8");
const ast = parse(input);
const _specification = compile(ast);
const _definition = compose(_specification);
build(_definition);
