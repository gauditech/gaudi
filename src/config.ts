export type EngineConfig = {
  inputPath: string;
  outputPath: string;
};

/** Read runtime config from environment or provide default values. */
export function readConfig(): EngineConfig {
  const inputPath = process.env.GAUDI_ENGINE_INPUT_PATH ?? "";
  const outputPath = process.env.GAUDI_ENGINE_OUTPUT_PATH ?? ".";

  return { inputPath, outputPath };
}
