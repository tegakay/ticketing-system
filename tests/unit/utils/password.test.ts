import { describe, expect, it } from 'vitest';
import { comparePassword, hashPassword } from '../../../src/utils/password';

describe('password utils', () => {
  it('hashes to something other than the plaintext', async () => {
    const hash = await hashPassword('Secret123!');
    expect(hash).not.toBe('Secret123!');
    expect(hash).toMatch(/^\$2[aby]\$10\$/);
  });

  it('produces a different hash each time (salted)', async () => {
    expect(await hashPassword('Secret123!')).not.toBe(await hashPassword('Secret123!'));
  });

  it('compares correctly', async () => {
    const hash = await hashPassword('Secret123!');
    expect(await comparePassword('Secret123!', hash)).toBe(true);
    expect(await comparePassword('wrong-password', hash)).toBe(false);
  });
});
