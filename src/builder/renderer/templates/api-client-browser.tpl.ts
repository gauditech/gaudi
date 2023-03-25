import _ from "lodash";

import { getRef } from "@src/common/refs";
import { assertUnreachable } from "@src/common/utils";
import {
  Definition,
  EndpointDef,
  EntrypointDef,
  FieldsetDef,
  FieldsetFieldDef,
  FieldsetRecordDef,
  SelectItem,
} from "@src/types/definition";

export type BuildApiClientData = {
  definition: Definition;
};

/** Template renderer */
export function render(data: BuildApiClientData): string {
  return buildClient(data.definition);
}

// --- API client

function buildClient(def: Definition): string {
  // TODO: read target and api from generator def block

  return `
  // ----- API client
  
  export type ApiClientOptions = {
    rootPath?: string;
    requestFn: ApiRequestFn;
  };

  export function createClient(options: ApiClientOptions) {
    return {
      api: buildApi(options ?? {}),
    };
  }

  ${buildApi(def, def.entrypoints, "")}

  ${buildCommonCode()}

  `;
}

type EntrypointNaming = {
  /** Original entrypoint name */
  name: string;
  /** Name of api segment. Must be a valid identifier */
  segment: string;
  /** Return type name */
  type: string;
  /** Name of builder factory function */
  builder: string;
};
type EntrypointApiEntry = { name: string; builderName: string; builderFn: string[] };

function buildApi(def: Definition, entrypoints: EntrypointDef[], basePath: string): string {
  const apiEntries = entrypoints.map((sub) => buildEntrypointApi(def, sub, basePath));

  const builderFns = apiEntries.map((sub) => sub.builderFn).flat();

  return `
    function buildApi(options: ApiClientOptions) {
      return {
        ${apiEntries
          .map((sub) => `${sub.name}: ${sub.builderName}(options, "${sub.name}")`)
          .join(",\n")}
      }
    }

    ${builderFns.join("\n")}
  `;
}

// --- entrypoint API

function buildEntrypointApi(
  def: Definition,
  entrypoint: EntrypointDef,
  basePath: string
): EntrypointApiEntry {
  const epName = entrypointNaming(entrypoint.name, entrypoint.target.retType);

  const entrypointEntries = entrypoint.entrypoints.map((sub) =>
    buildEntrypointApi(def, sub, basePath)
  );
  const endpointEntries = buildEndpointsApi(def, entrypoint.endpoints);

  const builderFn = `
  function ${epName.builder}(options: ApiClientOptions, parentPath: string) {
    ${endpointEntries
      .map((epe) => epe.types)
      .flat()
      .map((t) => `type ${t.name} = ${t.body};`)
      .join("\n")}

    function api(id: number | string) {
      const baseUrl = \`${basePath}\${parentPath}/\${id}\`;
      return {
        ${entrypointEntries
          .map((sub) => `${sub.name}: ${sub.builderName}(options, \`\${baseUrl}/${sub.name}\`)`)
          .join(",\n")}
      }
    }

    return Object.assign(api, 
      {
        ${endpointEntries.map((epb) => `${epb.name}: ${epb.builder}`).join(",\n")}
      }
    )
  }`;

  return {
    name: epName.segment,
    builderName: epName.builder,
    builderFn: [builderFn, ...entrypointEntries.map((sub) => sub.builderFn).flat()],
  };
}

// --- endpoint API

type EndpointApiEntry = { name: string; builder: string; types: { name: string; body: string }[] };

function buildEndpointsApi(def: Definition, endpoints: EndpointDef[]): EndpointApiEntry[] {
  return endpoints.map((ep) => buildEndpointApi(def, ep));
}

function buildEndpointApi(def: Definition, endpoint: EndpointDef): EndpointApiEntry {
  // endpoints currently don't define their errors so we can only manually hardcode it
  const commonErrorTypes = [
    // common server errors
    `"ERROR_CODE_RESOURCE_NOT_FOUND"`,
    `"ERROR_CODE_RESOURCE_NOT_FOUND"`,
    `"ERROR_CODE_SERVER_ERROR"`,
    // client errors - wraps any error that doesn't have structure { code, message, body? }
    `"ERROR_CODE_OTHER"`,
  ];

  const epKind = endpoint.kind;
  switch (epKind) {
    case "get": {
      const responseTypeName = `GetResp`;
      const responseType = renderSchema(selectToSchema(def, endpoint.response));

      const errorsType = commonErrorTypes.join("|");
      return {
        name: "get",
        builder: `buildGetFn<${responseTypeName}, ${errorsType}>(options, parentPath)`,
        types: [{ name: responseTypeName, body: responseType }],
      };
    }
    case "create": {
      const inputTypeName = "CreateData";
      const inputType = renderSchema(fieldsetToSchema(def, endpoint.fieldset));

      const responseTypeName = `CreateResp`;
      const responseType = renderSchema(selectToSchema(def, endpoint.response));

      const errorsType = [...commonErrorTypes, `"ERROR_CODE_VALIDATION"`].join("|");
      return {
        name: "create",
        builder: `buildCreateFn<${inputTypeName},${responseTypeName}, ${errorsType}>(options, parentPath)`,
        types: [
          { name: inputTypeName, body: inputType },
          { name: responseTypeName, body: responseType },
        ],
      };
    }
    case "update": {
      const inputTypeName = "UpdateData";
      const inputType = renderSchema(fieldsetToSchema(def, endpoint.fieldset));

      const responseTypeName = `UpdateResp`;
      const responseType = renderSchema(selectToSchema(def, endpoint.response));

      const errorsType = [...commonErrorTypes, `"ERROR_CODE_VALIDATION"`].join("|");
      return {
        name: "update",
        builder: `buildUpdateFn<${inputTypeName},${responseTypeName}, ${errorsType}>(options, parentPath)`,
        types: [
          { name: inputTypeName, body: inputType },
          { name: responseTypeName, body: responseType },
        ],
      };
    }
    case "delete": {
      const errorsType = commonErrorTypes.join("|");
      return {
        name: "delete",
        builder: `buildDeleteFn<${errorsType}>(options, parentPath)`,
        types: [],
      };
    }
    case "list": {
      const responseTypeName = `ListResp`;
      const responseType = renderSchema(selectToSchema(def, endpoint.response));

      const errorsType = commonErrorTypes.join("|");
      return {
        name: "list",
        builder: `buildListFn<${responseTypeName}, ${errorsType}>(options, parentPath)`,
        types: [{ name: responseTypeName, body: responseType }],
      };
    }
    case "custom-one": {
      const path = endpoint.path;
      const name = entrypointSegmentName(endpoint.path);
      const method = endpoint.method;
      switch (method) {
        case "GET":
        case "DELETE": {
          const errorsType = commonErrorTypes.join("|");

          return {
            name: name,
            builder: `buildCustomOneFetchFn<any, ${errorsType}>(options, parentPath, "${path}", "${method}")`,
            types: [],
          };
        }
        case "POST":
        case "PATCH": {
          const errorsType = [...commonErrorTypes, `"ERROR_CODE_VALIDATION"`].join("|");

          return {
            name: name,
            builder: `buildCustomOneSubmitFn<any, any, ${errorsType}>(options, parentPath, "${path}", "${method}")`,
            types: [],
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
      const name = entrypointSegmentName(endpoint.path);
      const method = endpoint.method;
      switch (method) {
        case "GET":
        case "DELETE": {
          const errorsType = commonErrorTypes.join("|");

          return {
            name: name,
            builder: `buildCustomManyFetchFn<any, ${errorsType}>(options, parentPath, "${path}", "${method}")`,
            types: [],
          };
        }
        case "POST":
        case "PATCH": {
          const errorsType = [...commonErrorTypes, `"ERROR_CODE_VALIDATION"`].join("|");

          return {
            name: name,
            builder: `buildCustomManySubmitFn<any, any, ${errorsType}>(options, parentPath, "${path}", "${method}")`,
            types: [],
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

function buildCommonCode(): string {
  return `

  // ----- API types

  export type EndpointHttpMethod = "GET" | "POST" | /*"PUT" |*/ "PATCH" | "DELETE";

  /** Result of API funciton call */
  export type ApiRequestFnData = {
    /** HTTP status */
    status: number;
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
    body?: string[][] | Record<string, string> | string | null;
    /** A Headers object, an object literal, or an array of two-item arrays to set request's headers. */
    headers?: [string, string][] | Record<string, string>;
    /** A string to set request's method. */
    method: EndpointHttpMethod;
  }
  
  export type ApiRequestBody = Record<string, unknown>;
  
  export type ApiResponseErrorBody<C extends string, D = unknown> = C extends any
    ? {
        code: C;
        message: string;
        data?: D;
      }
    : never;
  
  export type ApiResponse<D, E extends string> = ApiResponseSuccess<D, E> | ApiResponseError<D, E>;

  export type ApiResponseSuccess<D, E extends string> = {
    kind: "success";
    status: number;
    data: D;
  };

  export type ApiResponseError<D, E extends string> = {
    kind: "error";
    status: number;
    error: ApiResponseErrorBody<E>;
  };

      
  export type ListData = { filter?: Record<string, any>; page?: number; pageSize?: number };
  
  export type GetApiClientFn<R, E extends string> = (
    id: number,
    options?: Partial<ApiRequestInit>
  ) => Promise<ApiResponse<R, E>>;
  export type CreateApiClientFn<D extends ApiRequestBody, R, E extends string> = (
    data: D,
    options?: Partial<ApiRequestInit>
  ) => Promise<ApiResponse<R, E>>;
  export type UpdateApiClientFn<D, R, E extends string> = (
    id: number,
    data: D,
    options?: Partial<ApiRequestInit>
  ) => Promise<ApiResponse<R, E>>;
  export type ListApiClientFn<R, E extends string> = (
    data?: ListData,
    options?: Partial<ApiRequestInit>
  ) => Promise<ApiResponse<R[], E>>;
  export type DeleteApiClientFn<E extends string> = (
    id: number,
    options?: Partial<ApiRequestInit>
  ) => Promise<ApiResponse<void, E>>;
  
  export type CustomOneFetchApiClientFn<R, E extends string> = (
    id: number,
    options?: Partial<ApiRequestInit>
  ) => Promise<ApiResponse<R, E>>;
  export type CustomOneSubmitApiClientFn<D, R, E extends string> = (
    id: number,
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

  function buildGetFn<R, E extends string>(clientOptions: ApiClientOptions, parentPath: string): GetApiClientFn<R, E> {
    return async (id, options) => {
      const url = \`\${clientOptions.rootPath ?? ''}/\${parentPath}/\${id}\`;

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
      const url = \`\${clientOptions.rootPath ?? ''}/\${parentPath}\`;

      return (
        makeRequest(clientOptions, url, {
          method: "POST",
          body: JSON.stringify(data),
          headers: { ...(options?.headers ?? {}) },
        })
      );
    };
  }
  
  function buildUpdateFn<D extends ApiRequestBody, R, E extends string>(
    clientOptions: ApiClientOptions, parentPath: string
  ): UpdateApiClientFn<D, R, E> {
    return async (id, data, options) => {
      const url = \`\${clientOptions.rootPath ?? ''}/\${parentPath}/\${id}\`;

      return (
        makeRequest(clientOptions, url, {
          method: "PATCH",
          body: JSON.stringify(data),
          headers: { ...(options?.headers ?? {}) },
        })
      );
    };
  }
  
  function buildDeleteFn<E extends string>(clientOptions: ApiClientOptions, parentPath: string): DeleteApiClientFn<E> {
    return async (id, options) => {
      const url = \`\${clientOptions.rootPath ?? ''}/\${parentPath}/\${id}\`;

      return (
        makeRequest(clientOptions, url, {
          method: "DELETE",
          headers: { ...(options?.headers ?? {}) },
        })
      );
    };
  }
  
  function buildListFn<R, E extends string>(clientOptions: ApiClientOptions, parentPath: string): ListApiClientFn<R, E> {
    return async (data, options) => {
      const url = \`\${clientOptions.rootPath ?? ''}/\${parentPath}\`;
      // TODO: add data to URL params with URLSearchParams
  
      return (
        makeRequest(clientOptions, url, {
          method: "GET",
          headers: { ...(options?.headers ?? {}) },
        })
      );
    };
  }
  
  function buildCustomOneFetchFn<R, E extends string>(
    clientOptions: ApiClientOptions,
    parentPath: string,
    path: string,
    method: EndpointHttpMethod
  ): CustomOneFetchApiClientFn<R, E> {
    return async (id, options) => {
      const url = \`\${clientOptions.rootPath ?? ''}/\${parentPath}/\${id}/\${path}\`;

      return (
        makeRequest(clientOptions, url, {
          method,
          headers: { ...(options?.headers ?? {}) },
        })
      );
    };
  }
  
  function buildCustomOneSubmitFn<D extends ApiRequestBody, R, E extends string>(
    clientOptions: ApiClientOptions,
    parentPath: string,
    path: string,
    method: EndpointHttpMethod
  ): CustomOneSubmitApiClientFn<D, R, E> {
    return async (id, data, options) => {
      const url = \`\${clientOptions.rootPath ?? ''}/\${parentPath}/\${id}/\${path}\`;

      return (
        makeRequest(clientOptions, url, {
          method,
          body: JSON.stringify(data),
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
      const url = \`\${clientOptions.rootPath ?? ''}/\${parentPath}/\${path}\`;
  
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
      const url = \`\${clientOptions.rootPath ?? ''}/\${parentPath}/\${path}\`;

      return (
        makeRequest(clientOptions, url, {
          method,
          body: JSON.stringify(data),
          headers: { ...(options?.headers ?? {}) },
        })
      );
    };
  }
  async function makeRequest<D, E extends string>(
    options: ApiClientOptions,
    url: string,
    init: ApiRequestInit
  ): Promise<ApiResponse<D, E>> {
    if (options.requestFn == null) {
      throw new Error("Request function is required in API client");
    }
  
    return options.requestFn(url, init).then(({status, data}) => {
      if (status >= 200 && status < 300) {
        return {
          kind: "success",
          status,
          data,
        };
      } else {
        if (typeof data === "string") {
          return {
            kind: "error",
            status,
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
              error: data,
            };
          } else {
            return {
              kind: "error",
              status,
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

`;
}

// ----- utils

function entrypointNaming(name: string, typeName: string): EntrypointNaming {
  return {
    name,
    type: typeName,
    segment: entrypointSegmentName(name),
    builder: _.camelCase(`build${_.capitalize(name)}Api`),
  };
}

/**
 * Convert string to valid segment name.
 *
 * Segment name is name in API heirarchy.
 * Eg. in API `{ someSegment: someFn() }` segment name is `someSegment`.
 *
 * It must be a valid identifier so we use `camelCase` to remove any
 * special characters.
 */
function entrypointSegmentName(name: string) {
  return _.camelCase(name);
}

type SchemaField = {
  type: "string" | "number" | "boolean" | "number[]" | "unknown";
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

function convertFieldToSchemaType(
  type: "boolean" | "integer" | "text" | "list-integer"
): SchemaField["type"] {
  switch (type) {
    case "boolean":
      return type;
    case "integer":
      return "number";
    case "list-integer":
      return "number[]";
    case "text":
      return "string";
    default:
      assertUnreachable(type);
  }
}

function fieldsetToSchema(def: Definition, fieldset: FieldsetDef): SchemaObject {
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
    case "boolean":
    case "integer":
    case "text":
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
    properties: Object.fromEntries(
      select.map((item) => {
        const selectKind = item.kind;
        switch (selectKind) {
          case "field": {
            const field = getRef.field(def, item.refKey);
            return [
              item.alias,
              {
                type: convertFieldToSchemaType(field.type),
                nullable: field.nullable,
                optional: false,
              },
            ];
          }
          case "reference":
          case "relation":
          case "query": {
            // TODO: check optional/nullable
            const isObject = item.kind === "reference";
            const properties = selectToSchema(def, item.select);
            if (isObject) {
              return [item.alias, properties];
            } else {
              return [
                item.alias,
                { type: "array", items: properties, nullable: false, optional: false },
              ];
            }
          }
          case "aggregate": {
            // FIXME read the type from the `AggregateDef`
            return [item.name, { type: "number", nullable: false, optional: false }];
          }
          case "computed": {
            // TODO: check optional/nullable
            const computed = getRef.computed(def, item.refKey);
            const computedType =
              computed.type != null ? convertFieldToSchemaType(computed.type.type) : "unknown";

            return [item.name, { type: computedType, nullable: false, optional: false }];
          }
          case "model-hook": {
            // FIXME - add return type to hooks
            return [
              item.name,
              { type: "object", properties: {}, nullable: false, optional: false },
            ];
          }

          default:
            assertUnreachable(selectKind);
        }
      })
    ),
    nullable: false,
    optional: false,
  };
}

function renderSchema(schema: SchemaObject): string {
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
    case "string":
    case "number[]":
    case "unknown": {
      return `${name}${item.optional ? "?" : ""}: ${itemType}${item.nullable ? "|null" : ""}`;
    }
    case "array": {
      return `${name}: ${renderSchemaObject(item.items)}[]`;
    }
    case "object": {
      return `${name}: ${renderSchemaObject(item)}`;
    }
    default:
      assertUnreachable(itemType);
  }
}
