module.exports = async function () {
  // eslint-disable-next-line no-undef
  await globalThis.__EMBEDDED_POSTGRES_INSTANCE__.stop();
  /**
   * Node is buggy and keeps blocking the process for 15+sec so we help it shutdown.
   */
  process.exit();
};
