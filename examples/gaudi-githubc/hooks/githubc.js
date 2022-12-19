/* eslint-disable @typescript-eslint/no-var-requires */
const isAscii = require("is-ascii");

module.exports.noUnicode = function ({ name }) {
  return isAscii(name);
};
