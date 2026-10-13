import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppError, errorHandler, notFoundHandler } from '../../../src/middleware/errorHandler';
import { mockReq, mockRes } from '../../setup/http';

describe('errorHandler', () => {
  afterEach(() => {
    process.env.NODE_ENV = 'test';
    vi.restoreAllMocks();
  });

  it('uses the AppError status and message', () => {
    const res = mockRes();
    errorHandler(new AppError('Teapot', 418), mockReq(), res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(418);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: expect.objectContaining({ message: 'Teapot' }),
    });
  });

  it('hides the message of an unexpected error behind a generic 500', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = mockRes();
    errorHandler(new Error('db password is hunter2'), mockReq(), res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json.mock.calls[0]![0].error.message).toBe('Internal Server Error');
  });

  it('includes the stack outside production', () => {
    const res = mockRes();
    errorHandler(new AppError('Nope', 400), mockReq(), res, vi.fn());
    expect(res.json.mock.calls[0]![0].error.stack).toEqual(expect.any(String));
  });

  it('omits the stack in production', () => {
    process.env.NODE_ENV = 'production';
    const res = mockRes();
    errorHandler(new AppError('Nope', 400), mockReq(), res, vi.fn());
    expect(res.json.mock.calls[0]![0].error).not.toHaveProperty('stack');
  });
});

describe('notFoundHandler', () => {
  it('passes a 404 AppError to next', () => {
    const next = vi.fn();
    notFoundHandler(mockReq({ method: 'GET', originalUrl: '/nope' }), mockRes(), next);
    const err = next.mock.calls[0]![0];
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe('Route not found: GET /nope');
  });
});
