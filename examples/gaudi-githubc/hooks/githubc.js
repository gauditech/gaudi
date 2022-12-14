/* eslint-disable @typescript-eslint/no-var-requires */
const crypto = require("node:crypto");

const isAscii = require("is-ascii");

module.exports.noUnicode = function ({ name }) {
  return isAscii(name);
};

module.exports.randomSlug = function ({ salt }) {
  return salt + crypto.randomBytes(32).toString("base64");
};
