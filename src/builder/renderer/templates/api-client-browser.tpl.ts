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
  };

  export function createClient(options?: ApiClientOptions) {
    const rootPath = options?.rootPath ?? "";
    return {
      api: buildApi(rootPath),
    };
  }

  ${buildApi(def, def.entrypoints, "")}

  ${buildCommonCode()}

  `;
}

type EntrypointName = { name: string; segment: string; type: string; builder: string };
type EntrypointApiEntry = { name: string; builderName: string; builderFn: string[] };

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

// --- entrypoint API

function buildEntrypointApi(
  def: Definition,
  entrypoint: EntrypointDef,
  basePath: string
): EntrypointApiEntry {
  const epName = entrypointName(entrypoint.name, entrypoint.target.retType);

  const entrypointEntries = entrypoint.entrypoints.map((sub) =>
    buildEntrypointApi(def, sub, basePath)
  );
  const endpointEntries = buildEndpointsApi(def, entrypoint.endpoints, epName);

  const builderFn = `
  function ${epName.builder}(basePath: string) {
    ${endpointEntries
      .map((epe) => epe.types)
      .flat()
      .map((t) => `type ${t.name} = ${t.body};`)
      .join("\n")}

    const api = (id: number | string) => {
      const url = \`${basePath}/\${id}\`;
      return {
        ${entrypointEntries.map((sub) => `${sub.name}: ${sub.builderName}(url)`).join(",\n")}
      }
    }

    return Object.assign(api, 
      {
        ${endpointEntries.map((epb) => `${epb.name}: ${epb.builder}`)}
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

function buildEndpointsApi(
  def: Definition,
  endpoints: EndpointDef[],
  entrypName: EntrypointName
): EndpointApiEntry[] {
  return endpoints.map((ep) => buildEndpointApi(def, ep, entrypName));
}

function buildEndpointApi(
  def: Definition,
  endpoint: EndpointDef,
  entrypName: EntrypointName
): EndpointApiEntry {
  const epKind = endpoint.kind;
  switch (epKind) {
    case "get": {
      const responseTypeName = `GetResp`;
      const responseType = renderSchema(selectToSchema(def, endpoint.response));

      const path = entrypName.segment;
      const errorsType = `"CODE_11" | "CODE_12"`;
      return {
        name: "get",
        builder: `buildGetFn<${responseTypeName}, ${errorsType}>("${path}", basePath)`,
        types: [{ name: responseTypeName, body: responseType }],
      };
    }
    case "create": {
      const inputTypeName = "CreateData";
      const inputType = renderSchema(fieldsetToSchema(def, endpoint.fieldset));

      const responseTypeName = `CreateResp`;
      const responseType = renderSchema(selectToSchema(def, endpoint.response));

      const path = entrypName.segment;
      const errorsType = `"CODE_11" | "CODE_12"`;
      return {
        name: "create",
        builder: `buildCreateFn<${inputTypeName},${responseTypeName}, ${errorsType}>("${path}", basePath)`,
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

      const path = entrypName.segment;
      const errorsType = `"CODE_11" | "CODE_12"`;
      return {
        name: "update",
        builder: `buildUpdateFn<${inputTypeName},${responseTypeName}, ${errorsType}>("${path}", basePath)`,
        types: [
          { name: inputTypeName, body: inputType },
          { name: responseTypeName, body: responseType },
        ],
      };
    }
    case "delete": {
      const path = entrypName.segment;
      const errorsType = `"CODE_11" | "CODE_12"`;
      return {
        name: "delete",
        builder: `buildDeleteFn<${errorsType}>("${path}", basePath)`,
        types: [],
      };
    }
    case "list": {
      const responseTypeName = `ListResp`;
      const responseType = renderSchema(selectToSchema(def, endpoint.response));

      const path = entrypName.segment;
      const errorsType = `"CODE_11" | "CODE_12"`;
      return {
        name: "list",
        builder: `buildListFn<${responseTypeName}, ${errorsType}>("${path}", basePath)`,
        types: [{ name: responseTypeName, body: responseType }],
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
            types: [],
          };
        }
        case "POST":
        case "PATCH": {
          return {
            name: path,
            builder: `buildCustomOneSubmitFn<any, any, any>("${path}", "${method}", basePath)`,
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
      const method = endpoint.method;
      switch (method) {
        case "GET":
        case "DELETE": {
          return {
            name: path,
            builder: `buildCustomManyFetchFn<any, any>("${path}", "${method}", basePath)`,
            types: [],
          };
        }
        case "POST":
        case "PATCH": {
          return {
            name: path,
            builder: `buildCustomManySubmitFn<any, any, any>("${path}", "${method}", basePath)`,
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
