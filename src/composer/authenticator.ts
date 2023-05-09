import { getRef } from "@src/common/refs.js";
import { assertUnreachable } from "@src/common/utils.js";
import {
  AuthenticatorMethodDef,
  AuthenticatorNamedModelDef,
  Definition,
} from "@src/types/definition.js";
import { AuthenticatorMethodSpec, AuthenticatorSpec } from "@src/types/specification.js";

/**
 * Compose authenticator block.
 */
export function composeAuthenticator(def: Definition, spec: AuthenticatorSpec | undefined): void {
  if (spec == undefined) {
    return;
  }

  // hardcoded authenticator name - not exposed through blueprint cause we don't support multiple auth blocks yet
  const name = "Auth";
  const authUserModel = composeTargetModel(def, spec.authUserModelName);
  const accessTokenModel = composeTargetModel(def, spec.accessTokenModelName);
  const method = composeMethod(def, spec.method);

  def.authenticator = {
    name,
    authUserModel,
    accessTokenModel,
    method,
  };
}

function composeTargetModel(def: Definition, modelName: string): AuthenticatorNamedModelDef {
  // get authenticator target model (injected in compiler)
  const model = getRef.model(def, modelName);

  return {
    name: modelName,
    refKey: model.refKey,
  };
}

function composeMethod(
  def: Definition,
  methodSpec: AuthenticatorMethodSpec
): AuthenticatorMethodDef {
  const kind = methodSpec.kind;
  if (kind === "basic") {
    return {
      kind,
    };
  } else {
    assertUnreachable(kind);
  }
}
