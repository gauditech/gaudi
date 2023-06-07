import React, { FunctionComponent } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app";

const container = document.getElementById("root");
if (container == null) {
  throw "Root element not found";
}
const root = createRoot(container);
root.render(<App />);
