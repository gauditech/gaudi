import { getRef } from "@src/common/refs";
import { assertUnreachable } from "@src/common/utils";
import {
  AuthenticatorMethodDef,
  AuthenticatorTargetModelDef,
  Definition,
} from "@src/types/definition";
import { AuthenticatorMethodSpec, AuthenticatorSpec } from "@src/types/specification";

export function composeAuthenticator(def: Definition, spec: AuthenticatorSpec | undefined): void {
  if (spec == undefined) {
    return;
  }

  // hardcoded authenticator name - not exposed through blueprint cause we don't support multiple auth blocks yet
  const name = "Auth";
  const targetModel = composeTargetModel(def, spec);
  const method = composeMethod(spec.method);

  def.authenticator = {
    name,
    targetModel,
    method,
  };
}

function composeTargetModel(def: Definition, spec: AuthenticatorSpec): AuthenticatorTargetModelDef {
  const modelName = spec.targetModelName;

  // get authenticator target model (injected in compiler)
  const model = getRef.model(def, modelName);

  return {
    name: modelName,
    refKey: model.refKey,
  };
}

function composeMethod(spec: AuthenticatorMethodSpec): AuthenticatorMethodDef {
  const kind = spec.kind;
  if (kind === "basic") {
    return {
      kind,
    };
  } else {
    assertUnreachable(kind);
  }
}
