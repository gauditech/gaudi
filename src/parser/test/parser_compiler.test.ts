import fs from "fs";
import path from "path";

import { compile, parse } from "@src/index";

const extenstion = ".gaudi";
const folder = "./src/parser/test";
const blueprints = fs.readdirSync(folder).filter((name) => name.endsWith(extenstion));

describe("parser", () => {
  test.each(blueprints)("blueprint test/%s", (blueprintFilename) => {
    const blueprintPath = path.join(folder, blueprintFilename);
    const blueprint = fs.readFileSync(blueprintPath).toString();
    const specification = compile(parse(blueprint));
    expect(specification).toMatchSnapshot();
  });
});
