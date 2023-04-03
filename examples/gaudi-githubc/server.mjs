import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";

const rootFolder = process.argv[2] ?? ".";

const PORT = 8080;
const backendAddress = "http://localhost:3001";

const app = express();

// proxy to backend
app.use("/api", createProxyMiddleware({ target: backendAddress }));

// serve static files
app.use(express.static(rootFolder));

app.listen(PORT, () => {
  console.log(`Server listening on port: ${PORT}`);
  console.log(`  root folder: ${rootFolder}`);
});
