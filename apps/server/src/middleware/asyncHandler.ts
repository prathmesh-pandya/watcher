import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Express 4 doesn't forward rejected promises to the error handler, so every
 * async route is wrapped in this.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
