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

export function buildOpenAPI(definition: Definition): OpenAPIV3.Document {
  const endpoints = definition.apis.flatMap((api) =>
    api.entrypoints.flatMap((entrypoint) =>
      extractEndpoints(entrypoint).map((endpoint) => ({
        pathPrefix: api.path,
        apiName: api.name,
        endpoint,
      }))
    )
  );

  /**
   * Builds a list of required prop names that is attached to the object schema.
   *
   * Property is required if not nullable. This follows current validation implementation.
   */
  function buildRequiredProperties(select: SelectItem[]) {
    return select
      .map((select): [string, boolean] => {
        switch (select.kind) {
          case "field": {
            const field = getRef.field(definition, select.refKey);
            return [select.alias, !field.nullable];
          }
          case "reference":
          case "relation":
          case "query": {
            // reference/releation/query are always required themselves
            // their properties are handled for each object separately
            return [select.alias, true];
          }
          case "aggregate": {
            // FIXME read the type from the `AggregateDef`
            return [select.name, true];
          }
          case "computed": {
            const computed = getRef.computed(definition, select.refKey);
            return [select.name, computed.type.nullable];
          }
          case "model-hook": {
            // FIXME - add required type to hooks
            return [select.name, false]; // with hooks, everything is optional
          }
        }
      })
      .filter(([_name, required]) => required)
      .map(([name]) => name);
  }

  /** Create OpenAPI schema properties. */
  function buildSchemaProperties(select: SelectItem[]) {
    const schemaEntries = select.map((select): [string, OpenAPIV3.SchemaObject] => {
      switch (select.kind) {
        case "field": {
          const field = getRef.field(definition, select.refKey);
          return [
            select.alias,
            { type: convertToOpenAPIType(field.type), nullable: field.nullable },
          ];
        }
        // NOTE: not yet implemented; TODO: rename to `literal`
        // case "constant":
        //   return [select.alias, { type: convertToOpenAPIType(select.type) }];
        case "reference":
        case "relation":
        case "query": {
          const isObject = select.kind === "reference";
          const properties = buildSchemaProperties(select.select);
          const required = buildRequiredProperties(select.select);
          if (isObject) {
            return [select.alias, { type: "object", properties, required }];
          } else {
            return [
              select.alias,
              { type: "array", items: { type: "object", properties, required } },
            ];
          }
        }
        case "aggregate": {
          // FIXME read the type from the `AggregateDef`
          return [select.name, { type: "integer" }];
        }
        case "computed": {
          const computed = getRef.computed(definition, select.refKey);
          // FIXME - add return type to computeds
          return [
            select.name,
            { type: convertToOpenAPIType(computed.type.kind), nullable: computed.type.nullable },
          ];
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
    apiName: string | undefined,
    parameters: OpenAPIV3.ParameterObject[],
    hasContext: boolean
  ): OpenAPIV3.OperationObject {
    const properties = buildSchemaProperties(endpoint.response ?? []);
    const required = buildRequiredProperties(endpoint.response ?? []);

    const objectSchema: OpenAPIV3.SchemaObject = { type: "object", properties, required };

    let responseSchema: OpenAPIV3.SchemaObject;
    if (endpoint.kind === "list") {
      // pageable list response
      if (endpoint.pageable) {
        responseSchema = {
          type: "object",
          properties: {
            page: { type: convertToOpenAPIType("integer") },
            pageSize: { type: convertToOpenAPIType("integer") },
            totalPages: { type: convertToOpenAPIType("integer") },
            totalCount: { type: convertToOpenAPIType("integer") },
            data: { type: "array", items: objectSchema },
          },
          required: ["page", "pageSize", "totalPages", "totalCount", "data"],
        };
      }
      // plain list response
      else {
        responseSchema = {
          type: "array",
          items: objectSchema,
        };
      }
    }
    // object response
    else {
      responseSchema = objectSchema;
    }

    const operation: OpenAPIV3.OperationObject = {
      tags: apiName ? [apiName] : undefined,
      responses: {},
    };

    if (endpoint.kind === "delete") {
      operation.responses[204] = {
        description: "Successful response",
      };
    } else {
      operation.responses[200] = {
        description: "Successful response",
        content: { "application/json": { schema: responseSchema } },
      };
    }

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

  const paths = endpoints.reduce((paths, { pathPrefix, apiName, endpoint }) => {
    const endpointPath = buildEndpointPath(endpoint);
    const method = buildEndpointHttpMethod(endpoint);

    const path = [
      pathPrefix,
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
    pathItem[method] = buildEndpointOperation(endpoint, apiName, parameters, hasContext);
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
  type: "boolean" | "integer" | "text" | "unknown" | "null"
): OpenAPIV3.NonArraySchemaObjectType {
  switch (type) {
    case "boolean":
    case "integer":
      return type;
    case "text":
      return "string";
    case "unknown":
    case "null":
      // arbitrary type is "object"
      return "object";
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
