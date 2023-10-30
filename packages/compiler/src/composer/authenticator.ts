import { Definition } from "@compiler/types/definition";
import { Authenticator } from "@compiler/types/specification";

/**
 * Compose authenticator block.
 */
export function composeAuthenticator(def: Definition, spec: Authenticator | undefined): void {
  if (spec == undefined) {
    return;
  }

  // hardcoded authenticator name - not exposed through blueprint cause we don't support multiple auth blocks yet
  const model = spec.model.ref.model;

  def.authenticator = {
    model,
  };
}
