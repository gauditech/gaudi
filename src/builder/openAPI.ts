import { flatMap, mapValues } from "lodash";
import { OpenAPIV3 } from "openapi-types";

import { buildEndpointPath } from "./query";

import { getRef } from "@src/common/refs";
import {
  Definition,
  EndpointDef,
  EntrypointDef,
  FieldsetDef,
  SelectItem,
} from "@src/types/definition";

export function buildOpenAPI(definition: Definition, pathPrefix: string): OpenAPIV3.Document {
  const endpoints = definition.entrypoints.map(extractEndpoints).flat();

  function buildSchema(select: SelectItem[]) {
    const schemaEntries = select.map((select): [string, OpenAPIV3.SchemaObject] => {
      switch (select.kind) {
        case "field": {
          const field = getRef<"field">(definition, select.refKey);
          return [select.alias, { type: convertToOpenAPIType(field.value.type) }];
        }
        // NOTE: not yet implemented
        // case "constant":
        //   return [select.alias, { type: convertToOpenAPIType(select.type) }];
        case "reference":
        case "relation":
        case "query": {
          const isObject = select.kind === "reference";
          const properties = buildSchema(select.select);
          if (isObject) {
            return [select.alias, { type: "object", properties }];
          } else {
            return [select.alias, { type: "array", items: { type: "object", properties } }];
          }
        }
      }
    });

    return Object.fromEntries(schemaEntries);
  }

  function buildEndpointOperation(
    endpoint: EndpointDef,
    hasParameters: boolean
  ): OpenAPIV3.OperationObject {
    const properties = buildSchema(endpoint.response ?? []);
    const isArray = endpoint.kind === "list";

    const objectSchema: OpenAPIV3.SchemaObject = { type: "object", properties };
    const schema: OpenAPIV3.SchemaObject = isArray
      ? { type: "array", items: objectSchema }
      : objectSchema;

    const operation: OpenAPIV3.OperationObject = {
      responses: {
        200: {
          description: "Successful response",
          content: { "application/json": { schema } },
        },
      },
    };

    if (hasParameters) {
      operation.responses[404] = {
        description: "Resource not found",
        content: {
          "application/json": {
            schema: { type: "object", properties: { message: { type: "string" } } },
          },
        },
      };
    }

    if (endpoint.kind === "create") {
      const schema = buildSchemaFromFieldset(endpoint.fieldset);
      operation.requestBody = { content: { "application/json": { schema } } };
    }

    return operation;
  }

  const paths = endpoints.reduce((paths, endpoint) => {
    const gaudiPath = buildEndpointPath(endpoint);
    const method = buildEndpointMethod(endpoint);
    const parameters = gaudiPath.params.map(
      ({ name, type }): OpenAPIV3.ParameterObject => ({
        in: "path",
        name,
        required: true,
        schema: { type: convertToOpenAPIType(type) },
      })
    );
    // FIXME provide path components in definition
    const pathRegex = /:([\w]*)/g;
    const path = pathPrefix + gaudiPath.path.replace(pathRegex, "{$1}");

    const pathItem = paths[path] ?? { parameters };
    pathItem[method] = buildEndpointOperation(endpoint, parameters.length > 0);
    paths[path] = pathItem;

    return paths;
  }, {} as OpenAPIV3.PathsObject);

  return { openapi: "3.0.3", info: { title: "Title", version: "1.0.0" }, paths };
}

function buildSchemaFromFieldset(fieldset: FieldsetDef): OpenAPIV3.SchemaObject {
  if (fieldset.kind === "field") {
    return { type: convertToOpenAPIType(fieldset.type) };
  }

  const schema: OpenAPIV3.SchemaObject = { type: "object" };

  schema.properties = mapValues(fieldset.record, buildSchemaFromFieldset);

  const required = flatMap(fieldset.record, (fieldset, name) => (!fieldset.nullable ? [name] : []));
  if (required.length > 0) {
    schema.required = required;
  }

  return schema;
}

function convertToOpenAPIType(
  type: "boolean" | "integer" | "text"
): OpenAPIV3.NonArraySchemaObjectType {
  switch (type) {
    case "boolean":
    case "integer":
      return type;
    case "text":
      return "string";
  }
}

function extractEndpoints(entrypoint: EntrypointDef): EndpointDef[] {
  const nestedEndpoints = entrypoint.entrypoints.reduce((agg, entrypoint) => {
    return agg.concat(entrypoint.endpoints, extractEndpoints(entrypoint));
  }, [] as EndpointDef[]);
  return [...entrypoint.endpoints, ...nestedEndpoints];
}

function buildEndpointMethod(endpoint: EndpointDef): OpenAPIV3.HttpMethods {
  switch (endpoint.kind) {
    case "list":
      return OpenAPIV3.HttpMethods.GET;
    case "get":
      return OpenAPIV3.HttpMethods.GET;
    case "create":
      return OpenAPIV3.HttpMethods.POST;
    case "update":
      return OpenAPIV3.HttpMethods.PATCH;
    case "delete":
      return OpenAPIV3.HttpMethods.DELETE;
  }
}
