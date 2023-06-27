module.exports.divideStatic = function ({ x, y }) {
  return x / y;
};

module.exports.divideAsync = function ({ x, y }) {
  return new Promise((resolve) => {
    resolve(x / y);
  });
};
