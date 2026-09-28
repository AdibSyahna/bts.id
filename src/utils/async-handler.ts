import type { Request, RequestHandler, Response } from "express";

/**
 * Wraps an async route handler so rejected promises are forwarded to the
 * express error middleware instead of becoming unhandled rejections.
 */
export function asyncHandler<Params = Record<string, string>>(
  handler: (req: Request<Params>, res: Response) => Promise<void>,
): RequestHandler<Params> {
  return (req, res, next) => {
    handler(req, res).catch(next);
  };
}
