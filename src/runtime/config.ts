export type RuntimeConfig = {
  host: string;
  port: number;
  definitionPath: string;
};

/** Read runtime config from environment or provide default values. */
export function readConfig(): RuntimeConfig {
  const host = process.env.GAUDI_RUNTIME_SERVER_HOST ?? "127.0.0.1";
  const port =
    process.env.GAUDI_RUNTIME_SERVER_PORT != null
      ? parseInt(process.env.GAUDI_RUNTIME_SERVER_PORT, 10)
      : 3001;
  const definitionPath = process.env.GAUDI_RUNTIME_DEFINITION_PATH || "definition.json";

  return { host, port, definitionPath };
}
