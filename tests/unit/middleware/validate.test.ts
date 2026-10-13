import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { validate } from '../../../src/middleware/validate';
import { mockReq, mockRes } from '../../setup/http';

const schema = z.object({ quantity: z.number().int().positive() });

describe('validate', () => {
  it('returns 400 with details when the body is invalid', () => {
    const res = mockRes();
    const next = vi.fn();
    validate(schema)(mockReq({ body: { quantity: -1 } }), res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Validation failed', details: expect.any(Object) }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('replaces req.body with the parsed data (unknown keys stripped)', () => {
    const req = mockReq({ body: { quantity: 2, role: 'ADMIN' } });
    const next = vi.fn();
    validate(schema)(req, mockRes(), next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.body).toEqual({ quantity: 2 });
  });
});
