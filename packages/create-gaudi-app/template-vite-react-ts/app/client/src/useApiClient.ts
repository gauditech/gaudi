import { useMemo } from "react";
import * as api from "./api/api-client";

export type UseApiClientOptions = {
  /** API root path. Defaults to `/api` */
  rootPath?: string;
  /** Default headers */
  headers?: Record<string, string>;
};

/**
 * React hook that returns API client fetcher instance.
 *
 * Implements ApiClient's request fn using browser `fetch` API.
 */
export const useApiClient = (options?: UseApiClientOptions) => {
  const fetcher = useMemo(() => {
    return api.createClient({
      rootPath: options?.rootPath,
      headers: options?.headers,
    });
  }, [options?.rootPath, options?.headers]);

  return fetcher;
};
