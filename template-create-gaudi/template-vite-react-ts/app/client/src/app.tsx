import { ChangeEvent, FunctionComponent, useCallback, useState } from "react";
import { ApiClient } from "./api";

import "./style.css";

export type AppProps = {};
export const App: FunctionComponent<AppProps> = (props) => {
  const [output, setOutput] = useState<string>("");
  const [ident, setIdent] = useState<string>("");

  const identifierChangeHandler = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setIdent(event.target.value);
    },
    []
  );

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
          <h2>API fetcher</h2>
          <button onClick={fetchAuthorsListHandler}>Fetch authors</button>
          &nbsp;&nbsp;&nbsp;
          <button onClick={fetchAuthorHandler}>Fetch author</button>
          <input onChange={identifierChangeHandler} />
        </div>
        <div className="output-container">
          <pre>{output}</pre>
        </div>
      </div>
    </>
  );
};
