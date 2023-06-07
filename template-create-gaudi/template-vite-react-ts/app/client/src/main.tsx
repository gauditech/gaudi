import React from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";

import "./index.css";

const container = document.getElementById("root");
if (container == null) {
  throw "Root element not found";
}
createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
