import express from "express";
import { useGaudi } from "gaudi";

// --- config
const port = process.env.SERVER_PORT != null ? parseInt(process.env.SERVER_PORT, 10) : 8080;
const host = process.env.SERVER_HOST ?? "localhost";
const dbConnUrl = process.env.GAUDI_DATABASE_URL ?? "unknown-conn-url";
const outputFolder = process.env.GAUDI_RUNTIME_OUTPUT_PATH ?? "dist";
const definitionPath =
  process.env.GAUDI_RUNTIME_DEFINITION_PATH ?? `${outputFolder}/definition.json`;

const app = express();

// mount Gaudi app on root path
app.use(
  useGaudi({
    definitionPath,
    dbConnUrl,
    outputFolder,
  })
);

// start server
app.listen(port, host, () => {
  console.log(`Server listening on port: ${port}`);
});
