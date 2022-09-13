import fs from "fs";

import astInput from "../examples/git/ast.json";
import definitionInput from "../examples/git/definition.json";
import specificationInput from "../examples/git/specification.json";

import { build } from "./builder/builder";
import { compile } from "./compiler/compiler";
import { compose } from "./composer/composer";
import { parse } from "./parser/parser";

const blueprintPath = "./examples/git/blueprint.gaudi";

const input = fs.readFileSync(blueprintPath).toString("utf-8");
const _ast = parse(input);
const _specification = compile(astInput);
const _definition = compose(specificationInput);
build(definitionInput);
