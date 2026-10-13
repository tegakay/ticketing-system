import { describe, expect, it } from 'vitest';
import { createEventSchema, updateEventSchema } from '../../../src/validators/event.validator';

const valid = {
  name: 'Rock Night',
  description: 'Loud',
  date: '2026-12-01T20:00:00Z',
  venue_id: 'venue-1',
  price: 25,
  capacity: 100,
};

describe('createEventSchema', () => {
  it('accepts a valid event', () => {
    expect(createEventSchema.safeParse(valid).success).toBe(true);
  });

  it.each([
    ['1-char name', { name: 'R' }],
    ['non-ISO date', { date: '2026-12-01' }],
    ['zero price', { price: 0 }],
    ['negative price', { price: -5 }],
    ['fractional capacity', { capacity: 1.5 }],
    ['zero capacity', { capacity: 0 }],
    ['empty venue_id', { venue_id: '' }],
    ['long description', { description: 'x'.repeat(201) }],
  ])('rejects %s', (_label, override) => {
    expect(createEventSchema.safeParse({ ...valid, ...override }).success).toBe(false);
  });
});

describe('updateEventSchema', () => {
  it('accepts a single field', () => {
    expect(updateEventSchema.safeParse({ price: 30 }).success).toBe(true);
  });

  it('rejects an empty body', () => {
    expect(updateEventSchema.safeParse({}).success).toBe(false);
  });
});
