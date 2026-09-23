export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    // `code` é o identificador estável que o front usa para decidir (SPLIT_CONFLICT,
    // SPLIT_FULL); `details` carrega o payload fresco que acompanha o erro.
    public readonly code?: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}
