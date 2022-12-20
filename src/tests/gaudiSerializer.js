/**
 * Function `test` checks if this plugin should process the object.
 * This happens when "full" ohm.Interval object is detected.
 *
 * Function `serialize` strips unneeded properties from the interval,
 * keeping only startIdx and endIdx. Then calls `printer` function again.
 *
 * Internally, jest will call the `test` function, which will return `false`
 * this time (since we removed `sourceString` parameter), so this plugin
 * will be skipped.
 */

module.exports = {
  test: (val) => {
    const isObj = val && typeof val === "object" && !Array.isArray(val);
    const hasFullInterval = isObj && val.interval && val.interval.sourceString;
    return hasFullInterval;
  },
  serialize: (val, config, indentation, depth, refs, printer) => {
    const compact = {
      ...val,
      interval: { startIdx: val.interval.startIdx, endIdx: val.interval.endIdx },
    };
    return printer(compact, config, indentation, depth, refs);
  },
};
