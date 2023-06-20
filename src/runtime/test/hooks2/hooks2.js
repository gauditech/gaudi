module.exports.prefix = function ({ value, prefix }) {
  return `${prefix}${value}`;
};

module.exports.trim = function ({ value }) {
  return value.trim();
};
