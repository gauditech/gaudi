import { createClient } from "./api-client-entrypoint.js";

const headerEl = document.getElementById("header");
const viewerEl = document.getElementById("viewer-content");

const client = createClient({
  rootPath: "/api",
  requestFn: async (url, init) => {
    return fetch(url, init).then(async (response) => {
      const contentType = response.headers.get("content-type");
      const isJson = contentType != null && contentType.indexOf("/json") != -1;

      const data = isJson ? await response.json() : await response.text();

      return {
        status: response.status,
        header: response.headers,
        data,
      };
    });
  },
});

client.api.org.list().then((resp) => {
  console.log("RESPONSE", resp);
  let content = "";
  if (resp.kind === "success") {
    content = JSONTree.create(resp.data, undefined, 2);
  } else {
    content = JSONTree.create(resp.error, undefined, 2);
  }

  viewerEl.innerHTML = content;
});
