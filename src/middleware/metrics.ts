
import { Request, Response, NextFunction } from 'express';
import {httpRequestDuration, httpRequestCounter, httpRequestsInFlight} from '../utils/metrics.js';

export function metricsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const end = httpRequestDuration.startTimer();
  httpRequestsInFlight.inc();

  res.on('finish', () => {
    // req.route is populated once Express resolves the matching route;
    // fall back to req.path if it never matched (e.g. 404s)
    const route = req.route?.path ?? req.path;
    const labels = {
      method: req.method,
      route,
      status_code: String(res.statusCode),
    };

    end(labels);
    httpRequestCounter.inc(labels);
    httpRequestsInFlight.dec();
  });

  next();
}