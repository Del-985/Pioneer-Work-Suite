import type { Request, Response, NextFunction } from 'express';

interface ApiError extends Error {
  status?: number;
}

export function errorHandler(
  err: ApiError,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  console.error(err);

  const status = err.status ?? 500;
  const message =
    status === 500 ? 'Internal server error' : err.message || 'Error';

  res.status(status).json({ error: message });
}