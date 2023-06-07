import { ChangeEvent, FunctionComponent, useCallback, useState } from "react";
import { ApiClient } from "./ApiClient";

import "./App.css";

import reactLogo from "./assets/react.svg";
import gaudiLogo from "/gaudi.svg";
import viteLogo from "/vite.svg";
import tsLogo from "/typescript.svg";

export type AppProps = {
  // TODO: add your props
};
export const App: FunctionComponent<AppProps> = () => {
  const [output, setOutput] = useState<string>("");
  const [ident, setIdent] = useState<string>("");

  const identifierChangeHandler = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setIdent(event.target.value);
  }, []);

  const fetchAuthorsListHandler = useCallback(async () => {
    const authorsResp = await ApiClient.api.author.list();
    if (authorsResp.kind === "success") {
      const authors = authorsResp.data;

      setOutput(JSON.stringify(authors.data, undefined, 2));
    }
  }, []);

  const fetchAuthorHandler = useCallback(async () => {
    const authorsResp = await ApiClient.api.author.get(Number.parseInt(ident));
    if (authorsResp.kind === "success") {
      const author = authorsResp.data;

      setOutput(JSON.stringify(author, undefined, 2));
    }
  }, [ident]);

  return (
    <>
      <div className="container">
        <div className="button-container">
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
          <h1>API fetcher</h1>
          {/* API buttons */}
          <div className="fetcher-container">
            <button onClick={fetchAuthorsListHandler}>Fetch authors</button>
            <div className="fetcher-button-composite">
              <button onClick={fetchAuthorHandler}>Fetch author</button>
              <input onChange={identifierChangeHandler} placeholder="Author ID" />
            </div>
          </div>
        </div>
        <div className="output-container">
          <pre>{output}</pre>
        </div>
      </div>
    </>
  );
};
