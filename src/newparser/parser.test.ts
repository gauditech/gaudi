import * as fs from "fs";
import * as path from "path";

import { parse } from "./parser";

const folder = "./src/newparser/tests";
const sources = fs.readdirSync(folder);

describe("parser", () => {
  test.each(sources)("parse tests/%s", (sourceFilename) => {
    const sourcePath = path.join(folder, sourceFilename);
    const source = fs.readFileSync(sourcePath).toString();

    const result = parse(source);

    console.dir(result, { depth: 32 });
  });
});
