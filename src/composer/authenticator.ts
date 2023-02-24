import _ from "lodash";

import { getRef } from "@src/common/refs";
import { assertUnreachable } from "@src/common/utils";
import {
  AuthenticatorMethodDef,
  AuthenticatorNamedModelDef,
  Definition,
} from "@src/types/definition";
import {
  AuthenticatorMethodSpec,
  AuthenticatorSpec,
  Specification,
} from "@src/types/specification";

/**
 * Compose authenticator block.
 */
export function composeAuthenticator(def: Definition, spec: AuthenticatorSpec | undefined): void {
  if (spec == undefined) {
    return;
  }

  // hardcoded authenticator name - not exposed through blueprint cause we don't support multiple auth blocks yet
  const name = "Auth";
  const targetModel = composeTargetModel(def, spec.targetModelName);
  const accessTokenModel = composeTargetModel(def, spec.accessTokenModelName);
  const method = composeMethod(def, spec.method);

  def.authenticator = {
    name,
    targetModel,
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

/**
 * Create authenticator specs.
 */
export function compileAuthenticatorSpec(
  authenticatorSpec: AuthenticatorSpec | undefined
): Specification {
  if (authenticatorSpec == null) {
    return { models: [], entrypoints: [], populators: [], runtimes: [] };
  }

  const targetModelName = authenticatorSpec.targetModelName;
  const accessTokenModelName = authenticatorSpec.accessTokenModelName;

  return {
    models: [
      // target model
      {
        name: targetModelName,
        fields: [
          {
            name: "name",
            type: "text",
            validators: [{ kind: "builtin", name: "min", args: [1] }],
          },
          // this is used as username so it must be unique
          // if we had parallel auth methods this probably couldn't be unique anymore
          {
            name: "username",
            type: "text",
            unique: true,
            validators: [{ kind: "builtin", name: "min", args: [8] }],
          },
          {
            name: "password",
            type: "text",
            validators: [{ kind: "builtin", name: "min", args: [8] }],
          },
        ],
        references: [],
        relations: [
          {
            name: "tokens",
            fromModel: accessTokenModelName,
            through: "target",
          },
        ],
        queries: [],
        computeds: [],
        hooks: [],
      },
      // access token model
      // maybe this will have to renamed/moved when we have other auth methods
      {
        name: accessTokenModelName,
        fields: [
          {
            name: "token",
            type: "text",
            unique: true,
          },
          {
            name: "expiryDate",
            type: "text",
          },
        ],
        references: [{ name: "target", toModel: targetModelName }],
        relations: [],
        queries: [],
        computeds: [],
        hooks: [],
      },
    ],
    entrypoints: [],
    populators: [],
    runtimes: [],
  };
}
