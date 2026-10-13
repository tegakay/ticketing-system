import type { Request, Response } from 'express';
import { vi } from 'vitest';

export function mockReq(overrides: Partial<Request> = {}): Request {
  return { headers: {}, params: {}, body: {}, ...overrides } as Request;
}

export function mockRes() {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
  };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res as typeof res & Response;
}
