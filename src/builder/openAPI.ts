import _, { flatMap, mapValues } from "lodash";
import { OpenAPIV3 } from "openapi-types";
import { match } from "ts-pattern";

import { buildEndpointPath } from "@src/builder/query";
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
          const field = getRef.field(definition, select.refKey);
          return [select.alias, { type: convertToOpenAPIType(field.type) }];
        }
        // NOTE: not yet implemented; TODO: rename to `literal`
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
        case "aggregate": {
          // FIXME read the type from the `AggregateDef`
          return [select.name, { type: "integer" }];
        }
        case "computed": {
          // FIXME - add return type to computeds
          return [select.name, {}];
        }
        case "model-hook": {
          // FIXME - add return type to hooks
          return [select.name, {}];
        }
      }
    });

    return Object.fromEntries(schemaEntries);
  }

  function buildEndpointOperation(
    endpoint: EndpointDef,
    parameters: OpenAPIV3.ParameterObject[],
    hasContext: boolean
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

    if (hasContext) {
      operation.responses[404] = {
        description: "Resource not found",
        content: {
          "application/json": {
            schema: { type: "object", properties: { message: { type: "string" } } },
          },
        },
      };
    }

    operation.parameters = parameters;

    if (endpoint.kind === "create" || endpoint.kind === "update") {
      const schema = buildSchemaFromFieldset(endpoint.fieldset);
      operation.requestBody = { content: { "application/json": { schema } } };
    }

    return operation;
  }

  const paths = endpoints.reduce((paths, endpoint) => {
    const endpointPath = buildEndpointPath(endpoint);
    const method = buildEndpointHttpMethod(endpoint);

    const path =
      pathPrefix +
      [
        "",
        ..._.chain(endpointPath.fragments)
          .map((frag) => {
            return match(frag)
              .with({ kind: "namespace" }, (f) => f.name)
              .with({ kind: "identifier" }, (f) => `{${f.name}}`)
              .with({ kind: "query" }, () => null)
              .exhaustive();
          })
          .compact() // remove nulls
          .value(),
      ].join("/");

    const parameters = _.chain(endpointPath.fragments)
      .map((fragment): OpenAPIV3.ParameterObject | null => {
        return match(fragment)
          .with({ kind: "identifier" }, (f) => ({
            in: "path",
            name: f.name,
            required: true,
            schema: { type: convertToOpenAPIType(f.type) },
          }))
          .with({ kind: "query" }, (f) => ({
            in: "query",
            name: f.name,
            required: f.required,
            schema: { type: convertToOpenAPIType(f.type) },
          }))
          .with({ kind: "namespace" }, () => null)
          .exhaustive();
      })
      .compact()
      .value();

    // has parent or target context iow. identifier in URL
    const hasContext = endpointPath.fragments.some((f) => f.kind === "identifier");
    const pathItem = paths[path] ?? {};
    pathItem[method] = buildEndpointOperation(endpoint, parameters, hasContext);
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

function buildEndpointHttpMethod(endpoint: EndpointDef): OpenAPIV3.HttpMethods {
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
    default: {
      const method = endpoint.method;
      return OpenAPIV3.HttpMethods[method];
    }
  }
}
