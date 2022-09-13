import express from "express";

import { Definition } from "src/types/definition";

const app = express();
const port = 3000;

export function build(input: Definition): void {
  app.get("/", (req, res) => res.send("Hello world!"));
}

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
