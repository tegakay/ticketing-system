import { NextFunction, Request, Response } from 'express';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Object.setPrototypeOf(this, AppError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

interface ErrorResponseBody {
  success: false;
  error: {
    message: string;
    stack?: string;
  };
}

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404));
}

export function errorHandler(
  err: Error | AppError,
  _req: Request,
  res: Response<ErrorResponseBody>,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  const isAppError = err instanceof AppError;
  const statusCode = isAppError ? err.statusCode : 500;
  const message = isAppError && err.isOperational ? err.message : 'Internal Server Error';

  if (!isAppError || !err.isOperational) {
    console.error('[Unhandled Error]', err);
  }

  const body: ErrorResponseBody = {
    success: false,
    error: {
      message,
      ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
    },
  };

  res.status(statusCode).json(body);
}
