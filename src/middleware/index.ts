import express, { type Express, type Request } from 'express';
import {metricsMiddleware} from './metrics.js';

/**
 * Registers global request-parsing middleware. Kept separate from the error
 * handlers, which must be mounted after routes instead.
 */
export function registerGlobalMiddlewares(app: Express): void {
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        (req as Request).rawBody = buf;
      },
    }),
  );
  app.use(express.urlencoded({ extended: true }));
  app.use(metricsMiddleware);
}

export { AppError, errorHandler, notFoundHandler } from './errorHandler';
export { asyncHandler } from './asyncHandler';
export { authenticate, requireRole, requireSelfOrRole } from './auth';
export { validate } from './validate';
