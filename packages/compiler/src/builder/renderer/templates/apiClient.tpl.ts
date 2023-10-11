import _ from "lodash";
import { match } from "ts-pattern";

import { getRef } from "@compiler/common/refs";
import { assertUnreachable } from "@compiler/common/utils";
import { FieldType } from "@compiler/compiler/ast/type";
import {
  endpointHasContext,
  endpointUsesAuthentication,
  endpointUsesAuthorization,
  getEndpointFieldset,
} from "@compiler/composer/entrypoints";
import {
  ApiDef,
  Definition,
  EndpointDef,
  EntrypointDef,
  FieldsetDef,
  FieldsetFieldDef,
  FieldsetRecordDef,
  SelectItem,
} from "@compiler/types/definition";

export type BuildApiClientData = {
  definition: Definition;
  apis: ApiDef[];
};

/** Template renderer */
export function render(data: BuildApiClientData): string {
  return buildClient(data.definition, data.apis);
}

// --- API client

function buildClient(def: Definition, apis: ApiDef[]): string {
  // TODO: read target and api from generator def block

  return `

  ${buildHeaderCode()}

  // ----- API client

  export type ApiClientOptions = {
    /** Server API path prefix */
    rootPath?: string;
    /**
     * Function that implements HTTP calls and returns it's result.
     *
     * Default implementation depends on the existence of global \`fetch\` API.
     * That API should be supported in relevant browsers and node v 18+. 
     * If it's not found, default implementation fallbacks to \`undefined\` 
     * and users must provide their own implementation.
     * See \`resolveDefaultRequestFn()\` for details
     * 
     * If the default implementation is not sufficient, users are always free to
     * provide their own implementation using HTTP client lib of their choice.
     */
    requestFn?: ApiRequestFn;
    /** Default request headers which are added to all requests. */
    headers?: Record<string, string>
  };

  
  export function createClient(options?: ApiClientOptions) {
    const resolvedOptions = options ?? {}

    const internalOptions: ApiClientOptions = {
      rootPath: resolvedOptions.rootPath,
      requestFn: (resolvedOptions.requestFn ?? resolveDefaultRequestFn()),
      headers: {...(resolvedOptions.headers ?? {})},
    }
    
    return ${buildApisObject(apis)};
  }
  
  ${buildApis(def, apis)}
  
  ${buildCommonCode()}
  `;
}

type ApiName = Pick<TargetName, "identifierName" | "path" | "builder">;
type TargetName = {
  /**
   * Segment name is name in API heirarchy.
   * Eg. in API `{ someSegment: someFn() }` segment name is `someSegment`.
   *
   * It must be a valid identifier without special characters.
   */
  identifierName: string;
  /**
   * Name that can be used when naming type (eg. return type, error type, ...)
   *
   * Basically the same as `identifierName` but with capitalized first letter.
   */
  typeName: string;
  /** URL path used in REST APIs */
  path: string;
  /** Return type name */
  retTypeName: string;
  /** Name of builder factory function */
  builder: string;
};
type TargetWithIdentifierName = TargetName & {
  /** Identifier type name */ identifierType: string;
};

type EntrypointApiEntry = { name: string; path: string; builderName: string; builderFn: string[] };

function buildApisObject(apis: ApiDef[]): string {
  const rootApi = apis.find((api) => !api.name);
  const otherApis = apis.filter((api) => api.name);
  const properties = otherApis.map((api) => {
    const info = createApiInfo(api);
    return `${info.identifierName}: ${buildApiObject(api)}`;
  });
  if (rootApi) {
    properties.push(`...${buildApiObject(rootApi)}`);
  }

  return `{
    api: {
      ${properties.join(",\n")}
    }
  }`;
}

function buildApiObject(api: ApiDef): string {
  const info = createApiInfo(api);

  return `${info.builder}(internalOptions)`;
}

function buildApis(def: Definition, apis: ApiDef[]): string {
  return apis.map((api) => buildApi(def, api)).join("\n");
}

function buildApi(def: Definition, api: ApiDef): string {
  const info = createApiInfo(api);
  const apiEntries = api.entrypoints.map((sub) => buildEntrypointObject(def, sub));

  const builderFns = apiEntries.map((sub) => sub.builderFn).flat();

  return `
    function ${info.builder}(options: ApiClientOptions) {
      ${builderFns.join("\n")}

      return {
        ${apiEntries
          .map((sub) => `${sub.name}: ${sub.builderName}(options, "${info.path}/${sub.path}")`)
          .join(",\n")}
      }
    }
  `;
}

// --- entrypoint API

function buildEntrypointObject(def: Definition, entrypoint: EntrypointDef): EntrypointApiEntry {
  let targetInfo, identifierType;
  if (entrypoint.target.identifyWith) {
    targetInfo = createIdentifierTargetInfo(
      entrypoint.target.name,
      entrypoint.target.identifyWith.type,
      entrypoint.target.retType
    );
    identifierType = targetInfo.identifierType;
  } else {
    targetInfo = createTargetInfo(entrypoint.target.name, entrypoint.target.retType);
    identifierType = undefined;
  }

  const entrypointEntries = entrypoint.entrypoints.map((sub) => buildEntrypointObject(def, sub));
  const endpointEntries = buildEndpointsApi(def, entrypoint.endpoints);
  const endpointTypes = compactTypesArray(endpointEntries.map((epe) => epe.types).flat());

  const entrypointFunctionParams = identifierType ? `id: ${identifierType}` : "";
  const entrypointUrl = identifierType ? `\`\${parentPath}/\${id}\`` : `\`\${parentPath}\``;

  const builderFn = `
  function ${targetInfo.builder}(options: ApiClientOptions, parentPath: string) {
    // endpoint types
    ${endpointTypes.map((t) => `type ${t.name} = ${t.body};`).join("\n")}

    // entrypoint function
    function api(${entrypointFunctionParams}) {
      const baseUrl = ${entrypointUrl};
      return {
        ${entrypointEntries
          .map((sub) => `${sub.name}: ${sub.builderName}(options, \`\${baseUrl}/${sub.path}\`)`)
          .join(",\n")}
      }
    }

    // endpoint functions
    return Object.assign(api,
      {
        ${endpointEntries.map((epb) => `${epb.name}: ${epb.builder}`).join(",\n")}
      }
    )
  }`;

  return {
    name: targetInfo.identifierName,
    path: targetInfo.path,
    builderName: targetInfo.builder,
    builderFn: [builderFn, ...entrypointEntries.map((sub) => sub.builderFn).flat()],
  };
}

/**
 * Compact type definitions by referencing other equal types.
 *
 * Endpoint types are mostly very similar eg. all endpoints in one entrypoint return the same model.
 * This function goea through types list and if it finds equal types it removes duplicate definitions
 * and references one (the first)already defined type.
 *
 * Example of compacted list:
 * ```ts
 * // original types list
 * type GetResp = { id: number, name: string };
 * type UpdateResp = { id: number, name: string };
 *
 * // compacted types list
 * type GetResp = { id: number, name: string };
 * type UpdateResp = GetResp;
 * ```
 */
function compactTypesArray(types: EndpointApiEntry["types"]): EndpointApiEntry["types"] {
  const typeCache: Record<string, string> = {};

  return types.map((t) => {
    if (typeCache[t.body] == null) {
      typeCache[t.body] = t.name;

      return t;
    } else {
      return { name: t.name, body: typeCache[t.body] };
    }
  });
}

// --- endpoint API

type EndpointApiEntry = { name: string; builder: string; types: { name: string; body: string }[] };

function buildEndpointsApi(def: Definition, endpoints: EndpointDef[]): EndpointApiEntry[] {
  return endpoints.map((ep) => buildEndpointApi(def, ep));
}

function buildEndpointApi(def: Definition, endpoint: EndpointDef): EndpointApiEntry {
  // endpoints currently don't define their errors so we can only manually hardcode it
  const commonErrorTypes = [
    // server runtime error
    "ERROR_CODE_SERVER_ERROR",
    // client error - wraps any error that doesn't have structure { code, message, body? }
    "ERROR_CODE_OTHER",
  ];

  // TODO: import error codes that runtimes uses for more typesafety
  const customErrorTypes: string[] = _.compact([
    endpointHasContext(endpoint) && "ERROR_CODE_RESOURCE_NOT_FOUND",
    endpointUsesAuthentication(endpoint) && "ERROR_CODE_UNAUTHENTICATED",
    endpointUsesAuthorization(endpoint) && "ERROR_CODE_FORBIDDEN",
    getEndpointFieldset(endpoint) && "ERROR_CODE_VALIDATION",
  ]);

  const errorType = [...commonErrorTypes, ...customErrorTypes].map((err) => `"${err}"`).join("|");

  const epKind = endpoint.kind;
  switch (epKind) {
    case "get": {
      const responseTypeName = `GetResp`;
      const responseType = renderSchema(selectToSchema(def, endpoint.response));

      const errorTypeName = "GetError";

      let builder;
      if (endpoint.target.identifyWith) {
        const targetInfo = createIdentifierTargetInfo(
          endpoint.target.name,
          endpoint.target.identifyWith.type,
          endpoint.target.retType
        );
        const identifierType = targetInfo.identifierType;
        builder = `buildGetManyFn<${identifierType}, ${responseTypeName}, ${errorTypeName}>(options, parentPath)`;
      } else {
        builder = `buildGetOneFn<${responseTypeName}, ${errorTypeName}>(options, parentPath)`;
      }

      return {
        name: "get",
        builder,
        types: [
          { name: responseTypeName, body: responseType },
          { name: errorTypeName, body: errorType },
        ],
      };
    }
    case "create": {
      const inputTypeName = "CreateData";
      const inputType = renderSchema(fieldsetToSchema(def, endpoint.fieldset));

      const responseTypeName = `CreateResp`;
      const responseType = renderSchema(selectToSchema(def, endpoint.response));

      const errorTypeName = "CreateError";
      return {
        name: "create",
        builder: `buildCreateFn<${inputTypeName},${responseTypeName}, ${errorTypeName}>(options, parentPath)`,
        types: [
          { name: inputTypeName, body: inputType },
          { name: responseTypeName, body: responseType },
          { name: errorTypeName, body: errorType },
        ],
      };
    }
    case "update": {
      const inputTypeName = "UpdateData";
      const inputType = renderSchema(fieldsetToSchema(def, endpoint.fieldset));

      const responseTypeName = `UpdateResp`;
      const responseType = renderSchema(selectToSchema(def, endpoint.response));

      const errorTypeName = "UpdateError";

      let builder;
      if (endpoint.target.identifyWith) {
        const targetInfo = createIdentifierTargetInfo(
          endpoint.target.name,
          endpoint.target.identifyWith.type,
          endpoint.target.retType
        );
        const identifierType = targetInfo.identifierType;
        builder = `buildUpdateManyFn<${identifierType}, ${inputTypeName},${responseTypeName}, ${errorTypeName}>(options, parentPath)`;
      } else {
        builder = `buildUpdateOneFn<${inputTypeName},${responseTypeName}, ${errorTypeName}>(options, parentPath)`;
      }

      return {
        name: "update",
        builder,
        types: [
          { name: inputTypeName, body: inputType },
          { name: responseTypeName, body: responseType },
          { name: errorTypeName, body: errorType },
        ],
      };
    }
    case "delete": {
      const errorTypeName = "DeleteError";

      let builder;
      if (endpoint.target.identifyWith) {
        const targetInfo = createIdentifierTargetInfo(
          endpoint.target.name,
          endpoint.target.identifyWith.type,
          endpoint.target.retType
        );
        const identifierType = targetInfo.identifierType;
        builder = `buildDeleteManyFn<${identifierType}, ${errorTypeName}>(options, parentPath)`;
      } else {
        builder = `buildDeleteOneFn<${errorTypeName}>(options, parentPath)`;
      }

      return {
        name: "delete",
        builder,
        types: [{ name: errorTypeName, body: errorType }],
      };
    }
    case "list": {
      const responseTypeName = `ListResp`;
      const responseType = renderSchema(selectToSchema(def, endpoint.response));

      const errorTypeName = "ListError";

      if (endpoint.pageable) {
        return {
          name: "list",
          builder: `buildPaginatedListFn<${responseTypeName}, ${errorTypeName}>(options, parentPath)`,
          types: [
            { name: responseTypeName, body: responseType },
            { name: errorTypeName, body: errorType },
          ],
        };
      } else {
        return {
          name: "list",
          builder: `buildListFn<${responseTypeName}, ${errorTypeName}>(options, parentPath)`,
          types: [
            { name: responseTypeName, body: responseType },
            { name: errorTypeName, body: errorType },
          ],
        };
      }
    }
    case "custom-one": {
      let targetInfo, identifierType;
      if (endpoint.target.identifyWith) {
        targetInfo = createIdentifierTargetInfo(
          endpoint.path,
          endpoint.target.identifyWith.type,
          endpoint.target.retType
        );
        identifierType = targetInfo.identifierType;
      } else {
        targetInfo = createTargetInfo(endpoint.path, endpoint.target.retType);
        identifierType = undefined;
      }

      const path = endpoint.path;
      const name = targetInfo.identifierName;
      const typeName = targetInfo.typeName;

      const method = endpoint.method;
      switch (method) {
        case "GET":
        case "DELETE": {
          const errorTypeName = `${typeName}Error`;

          let builder;
          if (identifierType) {
            builder = `buildCustomOneFetchManyFn<${identifierType}, any, ${errorTypeName}>(options, parentPath, "${path}", "${method}")`;
          } else {
            builder = `buildCustomOneFetchOneFn<any, ${errorTypeName}>(options, parentPath, "${path}", "${method}")`;
          }

          return {
            name: name,
            builder,
            types: [{ name: errorTypeName, body: errorType }],
          };
        }
        case "POST":
        case "PATCH": {
          const errorTypeName = `${typeName}Error`;

          const inputTypeName = `${typeName}Data`;
          const inputType = renderSchema(
            endpoint.fieldset ? fieldsetToSchema(def, endpoint.fieldset) : undefined
          );

          let builder;
          if (identifierType) {
            builder = `buildCustomOneSubmitManyFn<${identifierType}, ${inputTypeName}, any, ${errorTypeName}>(options, parentPath, "${path}", "${method}")`;
          } else {
            builder = `buildCustomOneSubmitOneFn<${inputTypeName}, any, ${errorTypeName}>(options, parentPath, "${path}", "${method}")`;
          }

          return {
            name: name,
            builder,
            types: [
              { name: errorTypeName, body: errorType },
              { name: inputTypeName, body: inputType },
            ],
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
      const targetInfo = createTargetInfo(endpoint.path, endpoint.target.retType);

      const path = endpoint.path;
      const name = targetInfo.identifierName;
      const typeName = targetInfo.typeName;

      const method = endpoint.method;
      switch (method) {
        case "GET":
        case "DELETE": {
          const errorTypeName = `${typeName}Error`;

          return {
            name: name,
            builder: `buildCustomManyFetchFn<any, ${errorTypeName}>(options, parentPath, "${path}", "${method}")`,
            types: [{ name: errorTypeName, body: errorType }],
          };
        }
        case "POST":
        case "PATCH": {
          const errorTypeName = `${typeName}Error`;

          const inputTypeName = `${typeName}Data`;
          const inputType = renderSchema(
            endpoint.fieldset ? fieldsetToSchema(def, endpoint.fieldset) : undefined
          );

          return {
            name: name,
            builder: `buildCustomManySubmitFn<${inputTypeName}, any, ${errorTypeName}>(options, parentPath, "${path}", "${method}")`,
            types: [
              { name: errorTypeName, body: errorType },
              { name: inputTypeName, body: inputType },
            ],
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

/** Builds code that must be on top of the file such as imports and declarations. */
function buildHeaderCode(): string {
  return `
    // ---- imports & declarations

    // declare global fetch API as \`any\` to avoid Typescript typings problems
    declare let fetch: any;
    declare let Headers: any;
  `;
}

function buildCommonCode(): string {
  return `

  // ----- API types

  export type EndpointHttpMethod = "GET" | "POST" | /*"PUT" |*/ "PATCH" | "DELETE";

  /** Result of API function call */
  export type ApiRequestFnData = {
    /** HTTP status */
    status: number;
    /** HTTP repsonse headers map */
    headers: { [name: string]: string },
    /** Response body data. */
    data?: any;
  };

  /**
   * Function that performs request call and returns result.
   * This allows for any custom HTTP client (fetch, axios, ...) implementation
   * to be used regardless of environment (node, browser, ...).
   *
   * Return value from this function is wrapped by client in {ApiResponse}
   * structure and returned to the caller.
   *
   * @param url {string} request URL
   * @param init {ApiRequestInit} request details
   * @returns {ApiRequestFnData}
   */
  export type ApiRequestFn = (url: string, init: ApiRequestInit) => Promise<ApiRequestFnData>;

  /** API request additional parameters. */
  export type ApiRequestInit = {
    /** A BodyInit object or null to set request's body. */
    body?: any;
    /** A Headers object, an object literal, or an array of two-item arrays to set request's headers. */
    headers?: [string, string][] | Record<string, string>;
    /** A string to set request's method. */
    method: EndpointHttpMethod;
  }

  export type ApiRequestBody = any;

  export type ApiResponseErrorBody<C extends string, D = unknown> = C extends any
    ? {
        code: C;
        message: string;
        data?: D;
      }
    : never;

  export type ApiResponse<D, E extends string> = ApiResponseSuccess<D> | ApiResponseError<E>;

  export type ApiResponseSuccess<D> = {
    kind: "success";
    status: number;
    headers: {[name: string]: string},
    data: D;
  };

  export type ApiResponseError<E extends string> = {
    kind: "error";
    status: number;
    headers: { [name: string]: string },
    error: ApiResponseErrorBody<E>;
  };


  export type PaginatedListResponse<T> = {
    page: number;
    pageSize: number;
    totalPages: number;
    totalCount: number;
    data: T[];
  };

  // TODO: add list search/filter parameter
  export type PaginatedListData = { pageSize?: number; page?: number };

  export type GetApiClientManyFn<ID, R, E extends string> = (
    id: ID,
    options?: Partial<ApiRequestInit>
  ) => Promise<ApiResponse<R, E>>;

  export type GetApiClientOneFn<R, E extends string> = (
    options?: Partial<ApiRequestInit>
  ) => Promise<ApiResponse<R, E>>;

  export type CreateApiClientFn<D extends ApiRequestBody, R, E extends string> = (
    data: D,
    options?: Partial<ApiRequestInit>
  ) => Promise<ApiResponse<R, E>>;

  export type UpdateApiClientManyFn<ID, D, R, E extends string> = (
    id: ID,
    data: D,
    options?: Partial<ApiRequestInit>
  ) => Promise<ApiResponse<R, E>>;

  export type UpdateApiClientOneFn<D, R, E extends string> = (
    data: D,
    options?: Partial<ApiRequestInit>
  ) => Promise<ApiResponse<R, E>>;

  export type ListApiClientFn<R, E extends string> = (
    options?: Partial<ApiRequestInit>
  ) => Promise<ApiResponse<R[], E>>;

  export type PaginatedListApiClientFn<R, E extends string> = (
    data?: PaginatedListData,
    options?: Partial<ApiRequestInit>
  ) => Promise<ApiResponse<PaginatedListResponse<R>, E>>;

  export type DeleteApiClientManyFn<ID, E extends string> = (
    id: ID,
    options?: Partial<ApiRequestInit>
  ) => Promise<ApiResponse<void, E>>;

  export type DeleteApiClientOneFn<E extends string> = (
    options?: Partial<ApiRequestInit>
  ) => Promise<ApiResponse<void, E>>;

  export type CustomOneFetchApiClientManyFn<ID, R, E extends string> = (
    id: ID,
    options?: Partial<ApiRequestInit>
  ) => Promise<ApiResponse<R, E>>;

  export type CustomOneSubmitApiClientManyFn<ID, D, R, E extends string> = (
    id: ID,
    data?: D,
    options?: Partial<ApiRequestInit>
  ) => Promise<ApiResponse<R, E>>;

  export type CustomOneFetchApiClientOneFn<R, E extends string> = (
    options?: Partial<ApiRequestInit>
  ) => Promise<ApiResponse<R, E>>;

  export type CustomOneSubmitApiClientOneFn<D, R, E extends string> = (
    data?: D,
    options?: Partial<ApiRequestInit>
  ) => Promise<ApiResponse<R, E>>;

  export type CustomManyFetchApiClientFn<R, E extends string> = (
    options?: Partial<ApiRequestInit>
  ) => Promise<ApiResponse<R[], E>>;

  export type CustomManySubmitApiClientFn<D, R, E extends string> = (
    data?: D,
    options?: Partial<ApiRequestInit>
  ) => Promise<ApiResponse<R[], E>>;


  // ----- API fn factories

  function buildGetManyFn<ID, R, E extends string>(clientOptions: ApiClientOptions, parentPath: string): GetApiClientManyFn<ID, R, E> {
    return async (id, options) => {
      const url = \`\${clientOptions.rootPath ?? ''}\${parentPath}/\${id}\`;

      return (
        makeRequest(clientOptions, url, {
          method: "GET",
          headers: { ...(options?.headers ?? {}) },
        })
      );
    };
  }

  function buildGetOneFn<R, E extends string>(clientOptions: ApiClientOptions, parentPath: string): GetApiClientOneFn<R, E> {
    return async (options) => {
      const url = \`\${clientOptions.rootPath ?? ''}\${parentPath}\`;

      return (
        makeRequest(clientOptions, url, {
          method: "GET",
          headers: { ...(options?.headers ?? {}) },
        })
      );
    };
  }

  function buildCreateFn<D extends ApiRequestBody, R, E extends string>(
    clientOptions: ApiClientOptions, parentPath: string
  ): CreateApiClientFn<D, R, E> {
    return async (data, options) => {
      const url = \`\${clientOptions.rootPath ?? ''}\${parentPath}\`;

      return (
        makeRequest(clientOptions, url, {
          method: "POST",
          body: data,
          headers: { ...(options?.headers ?? {}) },
        })
      );
    };
  }

  function buildUpdateManyFn<ID, D extends ApiRequestBody, R, E extends string>(
    clientOptions: ApiClientOptions, parentPath: string
  ): UpdateApiClientManyFn<ID, D, R, E> {
    return async (id, data, options) => {
      const url = \`\${clientOptions.rootPath ?? ''}\${parentPath}/\${id}\`;

      return (
        makeRequest(clientOptions, url, {
          method: "PATCH",
          body: data,
          headers: { ...(options?.headers ?? {}) },
        })
      );
    };
  }

  function buildUpdateOneFn<D extends ApiRequestBody, R, E extends string>(
    clientOptions: ApiClientOptions, parentPath: string
  ): UpdateApiClientOneFn<D, R, E> {
    return async (data, options) => {
      const url = \`\${clientOptions.rootPath ?? ''}\${parentPath}\`;

      return (
        makeRequest(clientOptions, url, {
          method: "PATCH",
          body: data,
          headers: { ...(options?.headers ?? {}) },
        })
      );
    };
  }

  function buildDeleteManyFn<ID, E extends string>(clientOptions: ApiClientOptions, parentPath: string): DeleteApiClientManyFn<ID, E> {
    return async (id, options) => {
      const url = \`\${clientOptions.rootPath ?? ''}\${parentPath}/\${id}\`;

      return (
        makeRequest(clientOptions, url, {
          method: "DELETE",
          headers: { ...(options?.headers ?? {}) },
        })
      );
    };
  }

  function buildDeleteOneFn<E extends string>(clientOptions: ApiClientOptions, parentPath: string): DeleteApiClientOneFn<E> {
    return async (options) => {
      const url = \`\${clientOptions.rootPath ?? ''}\${parentPath}\`;

      return (
        makeRequest(clientOptions, url, {
          method: "DELETE",
          headers: { ...(options?.headers ?? {}) },
        })
      );
    };
  }

  function buildListFn<R, E extends string>(clientOptions: ApiClientOptions, parentPath: string): ListApiClientFn<R, E> {
    return async (options) => {
      const urlPath = \`\${clientOptions.rootPath ?? ''}\${parentPath}\`;

      return (
        makeRequest(clientOptions, urlPath, {
          method: "GET",
          headers: { ...(options?.headers ?? {}) },
        })
      );
    };
  }

  function buildPaginatedListFn<R, E extends string>(clientOptions: ApiClientOptions, parentPath: string): PaginatedListApiClientFn<R, E> {
    return async (data, options) => {
      const urlPath = \`\${clientOptions.rootPath ?? ''}\${parentPath}\`;

      const params = new URLSearchParams()
      Object.entries(data ?? {}).map(([key, value]) => params.set(key, JSON.stringify(value)))
      const urlParams = params.toString()

      const url = urlPath + (urlParams ? '?' + urlParams : '')

      return (
        makeRequest(clientOptions, url, {
          method: "GET",
          headers: { ...(options?.headers ?? {}) },
        })
      );
    };
  }

  function buildCustomOneFetchManyFn<ID, R, E extends string>(
    clientOptions: ApiClientOptions,
    parentPath: string,
    path: string,
    method: EndpointHttpMethod
  ): CustomOneFetchApiClientManyFn<ID, R, E> {
    return async (id, options) => {
      const url = \`\${clientOptions.rootPath ?? ''}\${parentPath}/\${id}/\${path}\`;

      return (
        makeRequest(clientOptions, url, {
          method,
          headers: { ...(options?.headers ?? {}) },
        })
      );
    };
  }

  function buildCustomOneSubmitManyFn<ID, D extends ApiRequestBody, R, E extends string>(
    clientOptions: ApiClientOptions,
    parentPath: string,
    path: string,
    method: EndpointHttpMethod
  ): CustomOneSubmitApiClientManyFn<ID, D, R, E> {
    return async (id, data, options) => {
      const url = \`\${clientOptions.rootPath ?? ''}\${parentPath}/\${id}/\${path}\`;

      return (
        makeRequest(clientOptions, url, {
          method,
          body: data,
          headers: { ...(options?.headers ?? {}) },
        })
      );
    };
  }

  function buildCustomOneFetchOneFn<R, E extends string>(
    clientOptions: ApiClientOptions,
    parentPath: string,
    path: string,
    method: EndpointHttpMethod
  ): CustomOneFetchApiClientOneFn<R, E> {
    return async (options) => {
      const url = \`\${clientOptions.rootPath ?? ''}\${parentPath}/\${path}\`;

      return (
        makeRequest(clientOptions, url, {
          method,
          headers: { ...(options?.headers ?? {}) },
        })
      );
    };
  }

  function buildCustomOneSubmitOneFn<D extends ApiRequestBody, R, E extends string>(
    clientOptions: ApiClientOptions,
    parentPath: string,
    path: string,
    method: EndpointHttpMethod
  ): CustomOneSubmitApiClientOneFn<D, R, E> {
    return async (data, options) => {
      const url = \`\${clientOptions.rootPath ?? ''}\${parentPath}/\${path}\`;

      return (
        makeRequest(clientOptions, url, {
          method,
          body: data,
          headers: { ...(options?.headers ?? {}) },
        })
      );
    };
  }

  function buildCustomManyFetchFn<R, E extends string>(
    clientOptions: ApiClientOptions,
    parentPath: string,
    path: string,
    method: EndpointHttpMethod
  ): CustomManyFetchApiClientFn<R, E> {
    return async (options) => {
      const url = \`\${clientOptions.rootPath ?? ''}\${parentPath}/\${path}\`;

      return (
        makeRequest(clientOptions, url, {
          method,
          headers: { ...(options?.headers ?? {}) },
        })
      );
    };
  }

  function buildCustomManySubmitFn<D extends ApiRequestBody, R, E extends string>(
    clientOptions: ApiClientOptions,
    parentPath: string,
    path: string,
    method: EndpointHttpMethod
  ): CustomManySubmitApiClientFn<D, R, E> {
    return async (data, options) => {
      const url = \`\${clientOptions.rootPath ?? ''}\${parentPath}/\${path}\`;

      return (
        makeRequest(clientOptions, url, {
          method,
          body: data,
          headers: { ...(options?.headers ?? {}) },
        })
      );
    };
  }
  async function makeRequest<D, E extends string>(
    clientOptions: ApiClientOptions,
    url: string,
    init: ApiRequestInit
  ): Promise<ApiResponse<D, E>> {
    if (clientOptions.requestFn == null) {
      throw new Error("Request function is required in API client");
    }

    const reqUrl = url
    const reqInit = {
      ...init,
      headers: {
        ...clientOptions.headers,
        ...(init.headers ?? {})
      }
    }

    return clientOptions.requestFn(reqUrl, reqInit).then(({status, data, headers = {} }) => {
      if (status >= 200 && status < 300) {
        return {
          kind: "success",
          status,
          headers,
          data,
        };
      } else {
        if (data == null) {
          return {
            kind: "error",
            status,
            headers,
            error: {
              code: "ERROR_CODE_OTHER",
              message: "empty response",
            } as ApiResponseErrorBody<E>,
            // TODO: fix response error type (TS complains about types not overlapping!?)
          };
        }
        else if (typeof data === "string") {
          return {
            kind: "error",
            status,
            headers,
            error: {
              code: "ERROR_CODE_OTHER",
              message: data,
            } as ApiResponseErrorBody<E>,
            // TODO: fix response error type (TS complains about types not overlapping!?)
          };
        } else {
          if ("code" in data && "message" in data) {
            return {
              kind: "error",
              status,
              headers,
              error: data,
            };
          } else {
            return {
              kind: "error",
              status,
              headers,
              error: {
                code: "ERROR_CODE_OTHER",
                message: "Unexpected error",
                data,
              } as ApiResponseErrorBody<E>,
              // TODO: fix response error type (TS complains about types not overlapping!?)
            };
          }
        }
      }
    });
  }

  /**
   * Create a default request function implementation for API client (see \`ApiClientOptions.requestFn\`).
   * 
   * Depends on the existence of global \`fetch\` API.
   * This should exist in all relevant browsers and node versions 18+.
   * 
   * If global \`fetch\` is not found, it returns \`undefined\` and user
   * must provide it's own implementation.
   * 
   * Since we make a runtime check for global \`fetch\` we declare it and other parts
   * of it's API as \`any\` to avoid unnecessary Typescript typings problems.
   */
  function resolveDefaultRequestFn() {
    // no global fetch, no function
    if (fetch === undefined) return;

    return (url: string, init: any) => {
      const method = init.method;
      const headers = new Headers({
        // presume JSON request but allow overriding by \`init.headers\`
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...(init.headers ?? {})
      })
      // detect JSON request
      const isJsonReq = (headers.get("content-type") ?? "").indexOf("/json") !== -1;
      const body = init.body != null && isJsonReq ? JSON.stringify(init.body) : init.body;

      return (
        // call API
        fetch(url, {
          method,
          body,
          headers,
        })
          // transform to struct required by API client
          .then(async (response: any) => {
            // detect JSON response
            const isJsonResp = (response.headers.get("content-type") ?? "").indexOf("/json") !== -1;

            const status = response.status
            const data = isJsonResp ? await response.json() : await response.text(); // pick response data type
            const headers = Object.fromEntries(response.headers.entries()); // copy headers structure

            return {
              status,
              data,
              headers
            };
          })
      );
    }
  }


  // ----- Helper types

  // define API method - helper type that shortens other types
  // maybe it could list a union of actual API method types but no need for now 
  type ApiMethod = (...args: any) => any;

  /**
   * Returns an array of API method request parameters.
   * 
   * Uses "infer" to force TS to resolve actual types instead of showing only this type's definition. 
   * 
   * Example:
   * 
   * \`\`\`ts
   * type MyApiDataReqParamsType = ApiRequestParametersType<typeof client.api.org.get>;
   * // =>
   * // type MyApiDataReqParamsType = [data: CreateData, options?: Partial<ApiRequestInit> | undefined]
   * \`\`\`
   * 
   */
  export type ApiRequestParametersType<T extends ApiMethod> = Parameters<T> extends [...infer Rest] ? Rest : never;

  /**
   * Returns API success response type.
   * 
   * \`\`\`ts
   * type MyApiDataRespType = ApiResponseSuccessType<typeof client.api.org.create>;
   * // =>
   * // type MyApiDataRespType = {
   * //   kind: "success";
   * //   status: number;
   * //   headers: {
   * //       [name: string]: string;
   * //   };
   * //   data: GetResp;
   * // }
   * \`\`\`
   * 
   */
  export type ApiResponseSuccessType<T extends ApiMethod> = Extract<Awaited<ReturnType<T>>, { kind: "success" }>;

  /**
   * Returns API success response data type.
   * 
   * Example:
   * 
   * \`\`\`ts
   * type MyApiSuccessDataType = ApiResponseSuccessDataType<typeof client.api.org.create>;
   * // =>
   * // type MyApiSuccessDataType = {
   * //   name: string;
   * //   slug: string;
   * //   description: string;
   * //   summary: string;
   * //   nameAndDesc: unknown;
   * //   blank_repos: {
   * //       id: number;
   * //       total_issues: number;
   * //       nameAndDesc: string;
   * //   }[];
   * //   newest_repo_name: string | null;
   * // }Type
   * \`\`\`
   * 
   */
  export type ApiResponseSuccessDataType<T extends ApiMethod> = ApiResponseSuccessType<T>["data"];

  /**
   * Returns API error response type.
   * 
   * Example:
   * 
   * \`\`\`ts
   * type MyApiErrResp = ApiResponseErrorType<typeof client.api.org.create>;
   * // =>
   * // type MyApiErrResp = {
   * //   kind: "error";
   * //   status: number;
   * //   headers: {
   * //       [name: string]: string;
   * //   };
   * //   error: {
   * //       code: "ERROR_CODE_SERVER_ERROR";
   * //       message: string;
   * //       data?: unknown;
   * //   } | {
   * //       code: "ERROR_CODE_OTHER";
   * //       message: string;
   * //       data?: unknown;
   * //   } | {
   * //       ...;
   * //   };
   * // }
   * \`\`\`
   * 
   */
  export type ApiResponseErrorType<T extends ApiMethod> = Extract<Awaited<ReturnType<T>>, { kind: "error" }>;

  /**
   * Returns API error response data type.
   * 
   * Example:
   * 
   * \`\`\`ts
   * type MyApiErrData = ApiResponseErrorDataType<typeof client.api.org.create>;
   * // =>
   * // type MyApiErrData = {
   * //       code: "ERROR_CODE_SERVER_ERROR";
   * //       message: string;
   * //       data?: unknown;
   * //   } | {
   * //       code: "ERROR_CODE_OTHER";
   * //       message: string;
   * //       data?: unknown;
   * //   } | {
   * //       code: "ERROR_CODE_VALIDATION";
   * //       message: string;
   * //       data?: unknown;
   * //   };
   * // }
   * \`\`\`
   * 
   */
  export type ApiResponseErrorDataType<T extends ApiMethod> = ApiResponseErrorType<T>["error"];

  /**
   * Returns a union of API error response codes.
   * 
   * Example:
   * 
   * \`\`\`ts
   * type MyApiErrRespCode = ApiResponseErrorCode<typeof client.api.org.create>;
   * // =>
   * // type MyApiErrRespCode = "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER" | "ERROR_CODE_VALIDATION"
   * \`\`\`
   * 
  */
  export type ApiResponseErrorCodeType<T extends ApiMethod> = ApiResponseErrorType<T>["error"]["code"];

`;
}

// ----- utils

function createApiInfo(api: ApiDef): ApiName {
  return {
    identifierName: _.camelCase(api.name || ""),
    path: api.path,
    builder: _.camelCase(`build${_.capitalize(api.name || "")}Api`),
  };
}
function createIdentifierTargetInfo(
  name: string,
  identifierType: "string" | "integer",
  typeName: string
): TargetWithIdentifierName {
  return Object.assign(createTargetInfo(name, typeName), {
    identifierType: convertFieldToSchemaType(identifierType),
  });
}
function createTargetInfo(name: string, retTypeName: string): TargetName {
  return {
    identifierName: _.camelCase(name),
    typeName: _.camelCase(name)
      .split("")
      // capitalize only the first letter
      .reduce((w, l, i) => w + (i === 0 ? l.toUpperCase() : l), ""),
    retTypeName,
    path: _.snakeCase(name),
    builder: _.camelCase(`build${_.capitalize(name)}Entrypoint`),
  };
}

type SchemaField = {
  type: "string" | "number" | "boolean" | "unknown" | "null";
  optional: boolean;
  nullable: boolean;
};
type SchemaObject = {
  type: "object";
  properties: { [k: string]: SchemaField | SchemaObject | SchemaArray };
  optional: boolean;
  nullable: boolean;
};
type SchemaArray = {
  type: "array";
  items: SchemaObject;
  optional: boolean;
  nullable: boolean;
};
type SchemaItem = SchemaField | SchemaObject | SchemaArray;

function convertFieldToSchemaType(type: FieldType | "null"): SchemaField["type"] {
  switch (type) {
    case "integer":
    case "float": {
      return "number";
    }
    case "string":
    case "boolean":
    case "null": {
      return type;
    }
    default: {
      assertUnreachable(type);
    }
  }
}

function fieldsetToSchema(def: Definition, fieldset?: FieldsetDef): SchemaObject | undefined {
  if (fieldset == null) return undefined;

  if (fieldset.kind !== "record") throw new Error('Root fieldset must be of kind "record".');

  return buildFieldsetObjectSchema(def, fieldset);
}

function buildFieldsetObjectSchema(def: Definition, field: FieldsetRecordDef): SchemaObject {
  return {
    type: "object",
    properties: Object.fromEntries(
      Object.entries(field.record).map(([name, value]) => {
        if (value.kind === "field") {
          return [name, buildFieldsetFieldSchema(def, value)];
        } else {
          return [name, buildFieldsetObjectSchema(def, value)];
        }
      })
    ),
    nullable: field.nullable,
    optional: false,
  };
}

function buildFieldsetFieldSchema(def: Definition, field: FieldsetFieldDef): SchemaField {
  switch (field.type) {
    case "integer":
    case "float":
    case "string":
    case "boolean":
      return {
        type: convertFieldToSchemaType(field.type),
        nullable: field.nullable,
        optional: !field.required,
      };
    default:
      assertUnreachable(field.type);
  }
}

function selectToSchema(def: Definition, select: SelectItem[]): SchemaObject {
  return {
    type: "object",
    properties: Object.fromEntries<SchemaField | SchemaObject | SchemaArray>(
      select.map((item) => {
        const schema = match<typeof item, SchemaField | SchemaObject | SchemaArray>(item)
          .with({ kind: "expression" }, (item) => ({
            type: convertFieldToSchemaType(item.type.kind),
            nullable: item.type.nullable,
            optional: false,
          }))
          .with({ kind: "model-hook" }, () => ({
            type: "unknown",
            nullable: false,
            optional: false,
          }))
          .with({ kind: "nested-select" }, (item) => {
            const ref = getRef(def, item.refKey);
            // FIXME use cardinality instead
            const isObject = ref.kind === "reference";
            const properties = selectToSchema(def, item.select);
            if (isObject) {
              return properties;
            } else {
              return { type: "array", items: properties, nullable: false, optional: false };
            }
          })
          .exhaustive();

        return [item.alias, schema];
      })
    ),
    nullable: false,
    optional: false,
  };
}

function renderSchema(schema: SchemaObject | undefined): string {
  if (schema == null) return "undefined";

  return renderSchemaObject(schema);
}

function renderSchemaObject(schema: SchemaObject): string {
  const properties = _.chain(schema.properties)
    .toPairs()
    .map(([name, value]) => renderSchemaItem(name, value))
    .join(",\n")
    .value();

  return `{ ${properties} }`;
}

function renderSchemaItem(name: string, item: SchemaItem): string {
  const itemType = item.type;
  switch (itemType) {
    case "boolean":
    case "number":
    case "string": {
      return `${name}${item.optional ? "?" : ""}: ${itemType}${item.nullable ? "|null" : ""}`;
    }
    case "unknown":
    case "null": {
      return `${name}${item.optional ? "?" : ""}: ${itemType}`;
    }
    case "array": {
      return `${name}: ${renderSchemaObject(item.items)}[]`;
    }
    case "object": {
      return `${name}: ${renderSchemaObject(item)}`;
    }
    default: {
      assertUnreachable(itemType);
    }
  }
}
