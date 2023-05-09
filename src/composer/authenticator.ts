import { kindFind } from "@src/common/kindFilter";
import * as AST from "@src/compiler/ast/ast";
import { accessTokenModelName, authUserModelName } from "@src/compiler/plugins/authenticator";
import {
  AuthenticatorMethodDef,
  AuthenticatorNamedModelDef,
  Definition,
} from "@src/types/definition";

/**
 * Compose authenticator block.
 */
export function composeAuthenticator(def: Definition, projectASTs: AST.ProjectASTs): void {
  if (!kindFind(projectASTs.document, "authenticator")) return;

  // for now we hardcode this stuff
  const name = "Auth";
  const authUserModel = composeTargetModel(authUserModelName);
  const accessTokenModel = composeTargetModel(accessTokenModelName);
  const method: AuthenticatorMethodDef = { kind: "basic" };

  def.authenticator = {
    name,
    authUserModel,
    accessTokenModel,
    method,
  };
}

function composeTargetModel(modelName: string): AuthenticatorNamedModelDef {
  return {
    name: modelName,
    refKey: modelName,
  };
}
