import { createClient } from "./api/api-client.ts";

export const ApiClient = createClient({
  async requestFn(url, init) {
    return (
      fetch(url, {
        method: init.method,
        body: init.body,
        headers: init.headers,
      })
        // transform to struct required by API client
        .then(async (response) => {
          return {
            status: response.status,
            data: await response.json(),
            headers: Object.fromEntries(response.headers.entries()),
          };
        })
    );
  },
});
