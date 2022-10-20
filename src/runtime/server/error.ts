export class EndpointError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    public readonly cause?: unknown
  ) {
    super("Endpoint action error");
  }
}
