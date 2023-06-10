import _, { flatMap, mapValues } from "lodash";
import { OpenAPIV3 } from "openapi-types";
import { P, match } from "ts-pattern";

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
  /**
   * Builds a list of required prop names that is attached to the object schema.
   *
   * Property is required if not nullable. This follows current validation implementation.
   */
  function buildRequiredProperties(select: SelectItem[]) {
    return select
      .map((select) => {
        return (
          match<typeof select, [string, boolean]>(select)
            .with({ kind: "expression" }, (item) => [item.alias, !item.type.nullable])
            // FIXME hook is currently always nullable
            .with({ kind: "model-hook" }, (item) => [item.alias, false])
            // reference/releation/query are always required themselves
            // their properties are handled for each object separately
            // FIXME respect cardinality and nullable!!
            .with({ kind: "nested-select" }, (item) => [item.alias, true])
            .exhaustive()
        );
      })
      .filter(([_name, required]) => required)
      .map(([name]) => name);
  }

  /** Create OpenAPI schema properties. */
  function buildSchemaProperties(select: SelectItem[]) {
    const schemaEntries = select.map((select): [string, OpenAPIV3.SchemaObject] => {
      return (
        match<typeof select, [string, OpenAPIV3.SchemaObject]>(select)
          .with({ kind: "expression" }, (item) => [
            item.alias,
            { type: convertToOpenAPIType(item.type.kind), nullable: item.type.nullable },
          ])
          // FIXME missing type info for hooks
          .with({ kind: "model-hook" }, (item) => [item.alias, {}])
          .with({ kind: "nested-select" }, (item) => {
            const ref = getRef(definition, item.refKey);
            // FIXME proper cardinality checks!
            const isObject = ref.kind === "reference";
            const properties = buildSchemaProperties(item.select);
            const required = buildRequiredProperties(item.select);
            if (isObject) {
              return [item.alias, { type: "object", properties, required }];
            } else {
              return [
                item.alias,
                { type: "array", items: { type: "object", properties, required } },
              ];
            }
          })
          .exhaustive()
      );
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
    match(endpoint)
      .with({ kind: P.union("get", "list", "delete") }, () => undefined)
      .otherwise((ep) => {
        if (!ep.fieldset) return;
        console.dir([ep.kind, ep.fieldset === undefined]);
        const schema = buildSchemaFromFieldset(ep.fieldset!);
        operation.requestBody = { content: { "application/json": { schema } } };
      });

    return operation;
  }

  const paths: OpenAPIV3.PathsObject = {};
  definition.apis.forEach((api) =>
    api.entrypoints.forEach((entrypoint) =>
      extractEndpoints(entrypoint).forEach((endpoint) => {
        const endpointPath = buildEndpointPath(endpoint);
        const method = buildEndpointHttpMethod(endpoint);

        const path = [
          api.path,
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
        pathItem[method] = buildEndpointOperation(endpoint, api.name, parameters, hasContext);
        paths[path] = pathItem;
      })
    )
  );

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
