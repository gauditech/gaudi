export type RuntimeConfig = {
  /** Runtime server host name */
  host: string;
  /** Runtime server port number */
  port: number;
  /** Path to generated definition.json file. */
  definitionPath: string;
  /** Folder where runtime should output generated files */
  outputPath: string;
};

/** Read runtime config from environment or provide default values. */
export function readConfig(): RuntimeConfig {
  const host = process.env.GAUDI_RUNTIME_SERVER_HOST ?? "127.0.0.1";
  const port =
    process.env.GAUDI_RUNTIME_SERVER_PORT != null
      ? parseInt(process.env.GAUDI_RUNTIME_SERVER_PORT, 10)
      : 3001;
  const definitionPath = process.env.GAUDI_RUNTIME_DEFINITION_PATH || "definition.json";
  const outputPath = process.env.GAUDI_RUNTIME_OUTPUT_PATH || ".";

  return { host, port, definitionPath, outputPath };
}
