import fs from "fs";
import { build } from "./builder/builder";
import { compile } from "./compiler/compiler";
import { compose } from "./composer/composer";
import { parse } from "./parser/parser";

import astInput from "../examples/git/ast.json";
import specificationInput from "../examples/git/specification.json";
import definitionInput from "../examples/git/definition.json";

const blueprintPath = "./examples/git/blueprint.gaudi";

const input = fs.readFileSync(blueprintPath).toString("utf-8");
const _ast = parse(input);
const _specification = compile(astInput);
const _definition = compose(specificationInput);
build(definitionInput);
