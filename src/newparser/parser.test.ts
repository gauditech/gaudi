import * as fs from "fs";
import * as path from "path";

import { parse } from "./parser";

const folder = "./src/newparser/tests";
const sources = fs.readdirSync(folder);

describe("parser", () => {
  test.each(sources)("blueprint tests/%s", (sourceFilename) => {
    const sourcePath = path.join(folder, sourceFilename);
    const blueprint = fs.readFileSync(sourcePath).toString();

    const parsed = parse(blueprint);

    console.dir(parsed, { depth: 32 });
  });
});
