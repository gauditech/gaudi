import { readConfig } from "@gaudi/runtime";
import { configDotenv } from "dotenv";
import express from "express";
import { useGaudi } from "gaudi";

console.log("Starting custom server runtime");

// read env
configDotenv({});

// read cofig
const config = readConfig();

// decompose config
const { port, host, definitionPath, dbConnUrl, outputDirectory, cors } = config;

// create new express app
const app = express();

// mount Gaudi app
app.use(
  useGaudi({
    definitionPath,
    dbConnUrl,
    outputDirectory,
    cors,
  })
);

// start server
app.listen(port, host, () => {
  console.log(`Server listening on port: ${port}`);
});
