import { describe, expect, it } from 'vitest';
import { createVenueSchema, updateVenueSchema } from '../../../src/validators/venue.validator';

const valid = { name: 'Main Hall', address: '1 Independence Ave', city: 'Accra', capacity: 500 };

describe('createVenueSchema', () => {
  it('accepts a valid venue', () => {
    expect(createVenueSchema.safeParse(valid).success).toBe(true);
  });

  it.each([
    ['short address', { address: 'short' }],
    ['missing city', { city: undefined }],
    ['zero capacity', { capacity: 0 }],
  ])('rejects %s', (_label, override) => {
    expect(createVenueSchema.safeParse({ ...valid, ...override }).success).toBe(false);
  });
});

describe('updateVenueSchema', () => {
  it('accepts a single field', () => {
    expect(updateVenueSchema.safeParse({ capacity: 10 }).success).toBe(true);
  });

  it('rejects an empty body', () => {
    expect(updateVenueSchema.safeParse({}).success).toBe(false);
  });
});
