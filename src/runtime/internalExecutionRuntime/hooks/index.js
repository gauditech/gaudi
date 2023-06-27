/** Returns given value. Can be used for testing&debugging. */
module.exports.echo = function ({ value }) {
  return value;
};

/** Returns given value. Can be used for testing&debugging. */
module.exports.log = function ({ label, value }) {
  console.log(`[LOG]${label != null ? ` [${label}]:` : ":"} ${value}`);
};
