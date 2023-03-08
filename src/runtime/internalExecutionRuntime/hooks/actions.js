/* eslint-disable @typescript-eslint/no-var-requires */
const bcrypt = require("bcrypt");

module.exports.authenticateUser = async function ({ clearPassword, hashPassword }) {
  console.log("[EXEC] authenticateUser", clearPassword, hashPassword);

  let match = false;
  if (clearPassword != null && hashPassword != null) {
    match = await bcrypt.compare(clearPassword, hashPassword);
  }

  if (!match) {
    throw { status: 401, body: { code: "ERROR_CODE_UNAUTHORIZED", message: "Unauthorized" } };
  }
};

module.exports.sendToken = async function ({ token }, ctx) {
  console.log("[EXEC] sendToken: ", token);
  ctx.response.json({ token });
};

/**
 * Send HTTP response with given status and body
 *
 * If status is not given, defaults to 200.
 * If body is not given, defaults to empty string.
 */
module.exports.sendResponse = async function ({ status, body }, ctx) {
  console.log("[EXEC] sendResponse: ", status, JSON.stringify(body));

  const responseStatus = status ?? 200;
  const responseBody = body ?? "";

  ctx.response.status(responseStatus).json(responseBody);
};
