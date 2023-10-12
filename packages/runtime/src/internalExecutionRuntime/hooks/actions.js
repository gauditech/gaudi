/* eslint-disable @typescript-eslint/no-var-requires */
const _ = require("lodash");

/**
 * Send HTTP response with given status and body
 *
 * If status is not given, defaults to 200.
 * If body is not given, defaults to empty string.
 *
 * Body is built from all arg properties prefixed with `body_` which is removed
 *  eg. { body_id: 1, body_name: "adsf" } -> { id: 1, name: "asdf "}
 * TODO: prefixed props should be removed once we can create record/map directly in blueprint
 */
module.exports.sendResponse = async function (args, ctx) {
  const PREFIX = "body_";
  const { status, ...rest } = args;

  // build body
  const body = _.chain(rest)
    .toPairs()
    .filter(([name, _value]) => name.startsWith(PREFIX))
    .map(([name, value]) => [name.replace(PREFIX, ""), value])
    .fromPairs()
    .value();

  console.log("[EXEC] sendResponse:", `[${status}]`, JSON.stringify(body));

  const responseStatus = status ?? 200;
  const responseBody = body ?? "";

  ctx.response.status(responseStatus).json(responseBody);
};

/**
 * Throw error `{ status, message }` if `condition` is "truthful".
 *
 * This is a replacement for bluprints not having conditionals nor error throwing.
 */
module.exports.throwConditionalResponseError = function ({ condition, status, message }) {
  console.log("[EXEC] throwConditionalResponseError", `[${condition}]`, status, message);
  if (condition) {
    throw { status, message };
  }
};
