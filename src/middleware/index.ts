import express, { Express } from 'express';

/**
 * Registers global request-parsing middleware. Kept separate from the error
 * handlers, which must be mounted after routes instead.
 */
export function registerGlobalMiddlewares(app: Express): void {
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
}

export { AppError, errorHandler, notFoundHandler } from './errorHandler';
export { asyncHandler } from './asyncHandler';
export { authenticate, requireRole, requireSelfOrRole } from './auth';
export { validate } from './validate';
