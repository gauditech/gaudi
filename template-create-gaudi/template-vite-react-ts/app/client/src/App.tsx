import { useCallback, useState } from "react";
import { useApiClient } from "./useApiClient";

import "./App.css";

import reactLogo from "./assets/react.svg";
import gaudiLogo from "/gaudi.svg";
import viteLogo from "/vite.svg";
import tsLogo from "/typescript.svg";

export function App() {
  const fetcher = useApiClient();
  const [output, setOutput] = useState<string>("");

  const fetchApiListHandler = useCallback(async () => {
    const resp = await fetcher.api.item.list();
    if (resp.kind === "success") {
      const itemList = resp.data.data;

      setOutput(JSON.stringify(itemList, undefined, 2));
    }
  }, [fetcher]);
  return (
    <>
      <h1 className="page-title">API fetcher</h1>

      {/* logo container */}
      <div className="logo-container">
        <a href="https://gaudi.tech" target="_blank">
          <img src={gaudiLogo} className="logo" alt="Gaudi logo" />
        </a>
        <div className="logo-hearts">&hearts;</div>
        <a href="https://vitejs.dev" target="_blank">
          <img src={viteLogo} className="logo" alt="Vite logo" />
        </a>
        &#x2795;
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
        &#x2795;
        <a href="https://www.typescriptlang.org/" target="_blank">
          <img src={tsLogo} className="logo typescript" alt="Typescript logo" />
        </a>
      </div>

      <br />
      <br />

      <div className="fetcher-container">
        <button onClick={fetchApiListHandler}>Fetch items list</button>
        <div className="response-cell">
          <h4>Server response</h4>
          <div className="output-container">
            <pre>{output}</pre>
          </div>
        </div>
      </div>
    </>
  );
}
