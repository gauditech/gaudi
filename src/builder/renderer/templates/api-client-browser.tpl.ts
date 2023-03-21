import _ from "lodash";

import { assertUnreachable } from "@src/common/utils";
import { Definition, EndpointDef, EntrypointDef } from "@src/types/definition";

export type BuildApiClientData = {
  definition: Definition;
};

export function render(data: BuildApiClientData): string {
  return buildClient(data.definition);
}

function buildClient(def: Definition): string {
  // TODO: read target and api from generator def block

  return `
// ----- API client
export type ApiClientOptions = {
  rootPath?: string;
};

export function createClient(options?: ApiClientOptions) {
  const rootPath = options?.rootPath ?? "";
  return {
    api: buildApi(rootPath),
  };
}

${buildApi(def, def.entrypoints, "")}

${buildCommonCode(def)}

`;
}

type EntrypointName = { name: string; segment: string; type: string; builder: string };
type EntrypointApiEntry = { name: string; builderName: string; builderFn: string[] };
type EndpointApiEntry = { name: string; builder: string };

function buildApi(def: Definition, entrypoints: EntrypointDef[], basePath: string): string {
  const apiEntries = entrypoints.map((sub) => buildEntrypointApi(def, sub, basePath));

  const builderFns = apiEntries.map((sub) => sub.builderFn).flat();

  return `
    function buildApi(basePath: string) {
      return {
        ${apiEntries.map((sub) => `${sub.name}: ${sub.builderName}(basePath)`).join(",\n")}
      }
    }

    ${builderFns.join("\n")}
  `;
}

function buildEntrypointApi(
  def: Definition,
  entrypoint: EntrypointDef,
  basePath: string
): EntrypointApiEntry {
  const epName = entrypointName(entrypoint.name, entrypoint.target.retType);
  console.log("EP NAME", epName);

  const entries = entrypoint.entrypoints.map((sub) => buildEntrypointApi(def, sub, basePath));

  const subBuilderFns = entries.map((sub) => sub.builderFn);

  const builderFn = `
function ${epName.builder}(basePath: string) {
  type ${epName.type} = { id: number, name: string }
  type ${epName.type}CreateData = { name: string }; // read from fieldset
  type ${epName.type}UpdateData = { id: number, name: string }; // read from fieldset

  const api = (id: number | string) => {
    const url = \`${basePath}/\${id}\`;
    return {
      ${entries.map((sub) => `${sub.name}: ${sub.builderName}(url)`).join(",\n")}
    }
  }

  return Object.assign(api, 
    ${buildEndpointsApi(def, entrypoint.endpoints, epName)}
  )
}
`;

  return {
    name: epName.segment,
    builderName: epName.builder,
    builderFn: [builderFn, ...subBuilderFns.flat()],
  };
}
function buildEndpointsApi(
  def: Definition,
  endpoints: EndpointDef[],
  entrypName: EntrypointName
): string {
  const apiEntries = endpoints.map((ep) => buildEndpointApi(def, ep, entrypName));

  const epApi = apiEntries.map((epb) => `${epb.name}: ${epb.builder}`);

  return `{
  ${epApi.join(",\n\t")}
  }`;
}

function buildEndpointApi(
  def: Definition,
  endpoint: EndpointDef,
  entrypName: EntrypointName
): EndpointApiEntry {
  const epKind = endpoint.kind;
  switch (epKind) {
    case "get": {
      const path = entrypName.segment;
      const returnType = entrypName.type;
      const errorsType = `"CODE_11" | "CODE_12"`;
      return {
        name: "get",
        builder: `buildGetFn<${returnType}, ${errorsType}>("${path}", basePath)`,
      };
    }
    case "create": {
      const path = entrypName.segment;
      const inputType = `${entrypName.type}CreateData`;
      const returnType = entrypName.type;
      const errorsType = `"CODE_11" | "CODE_12"`;
      return {
        name: "create",
        builder: `buildCreateFn<${inputType},${returnType}, ${errorsType}>("${path}", basePath)`,
      };
    }
    case "update": {
      const path = entrypName.segment;
      const returnType = entrypName.type;
      const inputType = `${entrypName.type}UpdateData`;
      const errorsType = `"CODE_11" | "CODE_12"`;
      return {
        name: "update",
        builder: `buildUpdateFn<${inputType},${returnType}, ${errorsType}>("${path}", basePath)`,
      };
    }
    case "delete": {
      const path = entrypName.segment;
      const errorsType = `"CODE_11" | "CODE_12"`;
      return {
        name: "delete",
        builder: `buildDeleteFn<${errorsType}>("${path}", basePath)`,
      };
    }
    case "list": {
      const path = entrypName.segment;
      const returnType = entrypName.type;
      const errorsType = `"CODE_11" | "CODE_12"`;
      return {
        name: "list",
        builder: `buildListFn<${returnType}, ${errorsType}>("${path}", basePath)`,
      };
    }
    case "custom-one": {
      const path = endpoint.path;
      const method = endpoint.method;
      switch (method) {
        case "GET":
        case "DELETE": {
          return {
            name: path,
            builder: `buildCustomOneFetchFn<any, any>("${path}", "${method}", basePath)`,
          };
        }
        case "POST":
        case "PATCH": {
          return {
            name: path,
            builder: `buildCustomOneSubmitFn<any, any, any>("${path}", "${method}", basePath)`,
          };
        }
        default: {
          assertUnreachable(method);
        }
      }
      // eslint complains about this "case" falling through even though it is exhaustive
      // https://github.com/typescript-eslint/typescript-eslint/issues/3455
      /* falls through -- disable lint rule */
    }
    case "custom-many": {
      const path = endpoint.path;
      const method = endpoint.method;
      switch (method) {
        case "GET":
        case "DELETE": {
          return {
            name: path,
            builder: `buildCustomManyFetchFn<any, any>("${path}", "${method}", basePath)`,
          };
        }
        case "POST":
        case "PATCH": {
          return {
            name: path,
            builder: `buildCustomManySubmitFn<any, any, any>("${path}", "${method}", basePath)`,
          };
        }
        default: {
          assertUnreachable(method);
        }
      }
      // eslint complains about this "case" falling through even though it is exhaustive
      // https://github.com/typescript-eslint/typescript-eslint/issues/3455
      /* falls through -- disable lint rule */
    }
    default: {
      assertUnreachable(epKind);
    }
  }
}

function buildCommonCode(def: Definition): string {
  return `

  // ----- API types

  type EndpointHttpMethod = "GET" | "POST" | /*"PUT" |*/ "PATCH" | "DELETE";
  
  type ApiRequestBody = Record<string, unknown>;
  
  type ApiResponseErrorBody<C extends string, D = unknown> = C extends any
    ? {
        code: C;
        message: string;
        data?: D;
      }
    : never;
  
  type ApiResponse<D, EC extends string> =
    | {
        kind: "success";
        status: number;
        data: D;
      }
    | {
        kind: "error";
        status: number;
        error: ApiResponseErrorBody<EC>;
      };
  
  type ApiClientFnOptions = { headers?: Record<string, string> };
  type ListData = { filter?: Record<string, any>; page?: number; pageSize?: number };
  
  type GetApiClientFn<R, E extends string> = (
    id: number,
    options?: ApiClientFnOptions
  ) => Promise<ApiResponse<R, E>>;
  type CreateApiClientFn<D extends ApiRequestBody, R, E extends string> = (
    data: D,
    options?: ApiClientFnOptions
  ) => Promise<ApiResponse<R, E>>;
  type UpdateApiClientFn<D, R, E extends string> = (
    id: number,
    data: D,
    options?: ApiClientFnOptions
  ) => Promise<ApiResponse<R, E>>;
  type ListApiClientFn<R, E extends string> = (
    data?: ListData,
    options?: ApiClientFnOptions
  ) => Promise<ApiResponse<R[], E>>;
  type DeleteApiClientFn<E extends string> = (
    id: number,
    options?: ApiClientFnOptions
  ) => Promise<ApiResponse<void, E>>;
  
  type CustomOneFetchApiClientFn<R, E extends string> = (
    id: number,
    options?: ApiClientFnOptions
  ) => Promise<ApiResponse<R, E>>;
  type CustomOneSubmitApiClientFn<D, R, E extends string> = (
    id: number,
    data?: D,
    options?: ApiClientFnOptions
  ) => Promise<ApiResponse<R, E>>;
  type CustomManyFetchApiClientFn<R, E extends string> = (
    options?: ApiClientFnOptions
  ) => Promise<ApiResponse<R[], E>>;
  type CustomManySubmitApiClientFn<D, R, E extends string> = (
    data?: D,
    options?: ApiClientFnOptions
  ) => Promise<ApiResponse<R[], E>>;


  // ----- API fn factories

  function buildGetFn<R, E extends string>(name: string, basePath: string): GetApiClientFn<R, E> {
    return async (id, options) => {
      const epPath = name;
      const url = \`\${basePath}/\${epPath}/\${id}\`;
  
      return (
        makeRequest(url, {
          method: "GET",
          headers: { ...(options?.headers ?? {}) },
        })
          // interpret response as JSON
          .then((response) => response.json())
      );
    };
  }
  
  function buildCreateFn<D extends ApiRequestBody, R, E extends string>(
    name: string,
    basePath: string
  ): CreateApiClientFn<D, R, E> {
    return async (data, options) => {
      const epPath = name;
      const url = \`\${basePath}/\${epPath}\`;
  
      return (
        makeRequest(url, {
          method: "POST",
          body: JSON.stringify(data),
          headers: { ...(options?.headers ?? {}) },
        })
          // interpret response as JSON
          .then((response) => response.json())
      );
    };
  }
  
  function buildUpdateFn<D extends ApiRequestBody, R, E extends string>(
    name: string,
    basePath: string
  ): UpdateApiClientFn<D, R, E> {
    return async (id, data, options) => {
      const epPath = name;
      const url = \`\${basePath}/\${epPath}/\${id}\`;
  
      return (
        makeRequest(url, {
          method: "PATCH",
          body: JSON.stringify(data),
          headers: { ...(options?.headers ?? {}) },
        })
          // interpret response as JSON
          .then((response) => response.json())
      );
    };
  }
  
  function buildDeleteFn<E extends string>(name: string, basePath: string): DeleteApiClientFn<E> {
    return async (id, options) => {
      const epPath = name;
      const url = \`\${basePath}/\${epPath}/\${id}\`;
  
      return (
        makeRequest(url, {
          method: "DELETE",
          headers: { ...(options?.headers ?? {}) },
        })
          // interpret response as JSON
          .then((response) => response.json())
      );
    };
  }
  
  function buildListFn<R, E extends string>(name: string, basePath: string): ListApiClientFn<R, E> {
    return async (data, options) => {
      const epPath = name;
      const url = \`\${basePath}/\${epPath}\`;
      // TODO: add data to URL params with URLSearchParams
  
      return (
        makeRequest(url, {
          method: "GET",
          headers: { ...(options?.headers ?? {}) },
        })
          // interpret response as JSON
          .then((response) => response.json())
      );
    };
  }
  
  function buildCustomOneFetchFn<R, E extends string>(
    name: string,
    method: EndpointHttpMethod,
    basePath: string
  ): CustomOneFetchApiClientFn<R, E> {
    return async (id, options) => {
      const url = \`\${basePath}/\${name}/\${id}\`;
  
      return (
        makeRequest(url, {
          method,
          headers: { ...(options?.headers ?? {}) },
        })
          // interpret response as JSON
          .then((response) => response.json())
      );
    };
  }
  
  function buildCustomOneSubmitFn<D extends ApiRequestBody, R, E extends string>(
    name: string,
    method: EndpointHttpMethod,
    basePath: string
  ): CustomOneSubmitApiClientFn<D, R, E> {
    return async (id, data, options) => {
      const epPath = name;
      const url = \`\${basePath}/\${epPath}/\${id}\`;
  
      return (
        makeRequest(url, {
          method,
          body: JSON.stringify(data),
          headers: { ...(options?.headers ?? {}) },
        })
          // interpret response as JSON
          .then((response) => response.json())
      );
    };
  }
  
  function buildCustomManyFetchFn<R, E extends string>(
    name: string,
    method: EndpointHttpMethod,
    basePath: string
  ): CustomManyFetchApiClientFn<R, E> {
    return async (options) => {
      const epPath = name;
      const url = \`\${basePath}/\${epPath}\`;
  
      return (
        makeRequest(url, {
          method,
          headers: { ...(options?.headers ?? {}) },
        })
          // interpret response as JSON
          .then((response) => response.json())
      );
    };
  }
  
  function buildCustomManySubmitFn<D extends ApiRequestBody, R, E extends string>(
    name: string,
    method: EndpointHttpMethod,
    basePath: string
  ): CustomManySubmitApiClientFn<D, R, E> {
    return async (data, options) => {
      const epPath = name;
      const url = \`\${basePath}/\${epPath}\`;
  
      return (
        makeRequest(url, {
          method,
          body: JSON.stringify(data),
          headers: { ...(options?.headers ?? {}) },
        })
          // interpret response as JSON
          .then((response) => response.json())
      );
    };
  }
  
  async function makeRequest(url: string, init: RequestInit) {
    return fetch(url, init);
  }
  `;
}

// ----- utils

function entrypointName(name: string, type: string): EntrypointName {
  return {
    name,
    type,
    segment: _.toLower(name),
    builder: _.camelCase(`build${_.capitalize(name)}Api`),
  };
}
