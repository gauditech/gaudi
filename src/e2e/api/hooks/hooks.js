// ----- utils

module.exports.noUnicode = function ({ name }) {
  for (var i = 0; i < name.length; i++) {
    if (name.charCodeAt(i) > 127) return false;
  }
  return true;
};

module.exports.randomSlug = function ({ org }) {
  const prefix = org.toLocaleLowerCase().replace(/\s/, "_");
  const randomString = "W5JU1e0Kj1Kv"; // https://xkcd.com/221/
  return prefix + "-" + randomString;
};

// ----- actions

module.exports.customAction = function(args, ctx) {
  // console.log('[EXEC] customAction: ', args, typeof ctx.request, typeof ctx.response)

  // return args via HTTP header
  ctx.response.set('Gaudi-Test-body', JSON.stringify(args))
}
