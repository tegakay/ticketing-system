import { describe, expect, it, vi } from 'vitest';
import { asyncHandler } from '../../../src/middleware/asyncHandler';
import { mockReq, mockRes } from '../../setup/http';

describe('asyncHandler', () => {
  it('forwards a rejected promise to next', async () => {
    const err = new Error('boom');
    const next = vi.fn();
    asyncHandler(async () => {
      throw err;
    })(mockReq(), mockRes(), next);
    await vi.waitFor(() => expect(next).toHaveBeenCalledWith(err));
  });

  it('does not call next when the handler resolves', async () => {
    const next = vi.fn();
    const handler = vi.fn(async () => undefined);
    asyncHandler(handler)(mockReq(), mockRes(), next);
    await Promise.resolve();
    expect(handler).toHaveBeenCalledOnce();
    expect(next).not.toHaveBeenCalled();
  });
});
