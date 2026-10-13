import type { TokenPayload } from '../utils/jwt';

declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
      /** Unparsed request body, kept for webhook signature verification. */
      rawBody?: Buffer;
    }
  }
}

export {};
