import type { Request, Response, NextFunction } from 'express';
import morgan from 'morgan';

export const requestLogger = morgan('dev');

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  console.error('[ERROR]', err.message);
  res.status(500).json({ success: false, error: err.message });
}
