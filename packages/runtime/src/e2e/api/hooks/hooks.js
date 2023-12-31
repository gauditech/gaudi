// ----- utils

module.exports.noUnicode = function ({ name }) {
  for (var i = 0; i < name.length; i++) {
    if (name.charCodeAt(i) > 127) return false;
  }
  return true;
};

module.exports.randomSlug = function ({ org, sequence }) {
  const prefix = org.toLocaleLowerCase().replace(/\s/, "_");
  const randomString = sequence.map((x) => x.toString()).join("") + "W5JU1e0Kj1Kv"; // https://xkcd.com/221/
  return prefix + "-" + randomString;
};

// ----- actions

module.exports.customAction = function (args, ctx) {
  console.log("[EXEC] customAction: ", args);

  // return args via HTTP header
  ctx.response.set("Gaudi-Test-body", JSON.stringify(args));
};

/** Custom action that sends entire response */
module.exports.customActionResponds = function (args, ctx) {
  console.log("[EXEC] customActionResponds: ", args);

  // send entire response
  ctx.response.json(args);
};

/**
 * Throws error `{ status, message }`
 *
 * If `status` is empty it will throw some other text error
 */
module.exports.customHttpErrorResponse = function ({ status, message }) {
  if (status != null) {
    throw { status, message: message ?? "" };
  } else {
    throw "some other error";
  }
};

/**
 * Log hooks args object to console
 */
module.exports.logger = function (args) {
  console.log("Hook args: ", JSON.stringify(args, undefined, 2));
};

/**
 * Returns the same args object. Like an echo. :)
 */
module.exports.echo = function (args) {
  return { ...args };
};
