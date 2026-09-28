/**
 * Error that carries the HTTP status code an API consumer should receive.
 */
export class HttpError extends Error {
  readonly status: number;
  readonly details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    if (details !== undefined) {
      this.details = details;
    }
  }

  static badRequest(message: string, details?: unknown): HttpError {
    return new HttpError(400, message, details);
  }

  static notFound(message: string): HttpError {
    return new HttpError(404, message);
  }

  static conflict(message: string, details?: unknown): HttpError {
    return new HttpError(409, message, details);
  }

  static unauthorized(message: string, details?: unknown): HttpError {
    return new HttpError(401, message, details);
  }

  static forbidden(message: string, details?: unknown): HttpError {
    return new HttpError(403, message, details);
  }
}
