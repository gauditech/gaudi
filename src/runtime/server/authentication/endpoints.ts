import { assertUnreachable } from "@src/common/utils";
import {
  buildAuthenticationHandler as buildBasicAuthenticationHandler,
  buildEndpoints as buildBasicEndpoints,
} from "@src/runtime/server/authentication/basic";
import { EndpointConfig } from "@src/runtime/server/types";
import { Definition } from "@src/types/definition";

// ---------- Endpoints

/** Function that returns list of all authentication endpoints. */
export function buildEndpoints(def: Definition): EndpointConfig[] {
  if (!def.authenticator) return [];

  const endpoints: EndpointConfig[] = [];

  const methodKind = def.authenticator.method.kind;
  if (methodKind === "basic") {
    endpoints.push(...buildBasicEndpoints(def));
  } else {
    assertUnreachable(methodKind);
  }

  return endpoints;
}

// ---------- Request handlers

export type AuthenticationOptions = {
  allowAnonymous?: boolean;
};

/**
 * Create authentication request handler
 */
export function buildAuthenticationHandler(def: Definition, options?: AuthenticationOptions) {
  if (!def.authenticator) return;

  const methodKind = def.authenticator.method.kind;
  if (methodKind === "basic") {
    return buildBasicAuthenticationHandler(def, options);
  } else {
    assertUnreachable(methodKind);
  }
}
