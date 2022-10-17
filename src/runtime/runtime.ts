import express, { Request, Response } from "express";

const app = express();
const port = 3001; // TODO: read port from env

function helloEndpoint(req: Request, res: Response) {
  res.send("Hello world!!!");
}
app.get("/hello", helloEndpoint);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
