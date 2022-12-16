/* eslint-disable @typescript-eslint/no-var-requires */
const crypto = require("node:crypto");

const isAscii = require("is-ascii");

module.exports.noUnicode = function ({ name }) {
  return isAscii(name);
};

module.exports.randomSlug = function ({ org }) {
  return org + "/" + crypto.randomBytes(32).toString("base64");
};
