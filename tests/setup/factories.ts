import type { Event, Order, User, Venue } from '@prisma/client';
import { Prisma } from '@prisma/client';

const CREATED = new Date('2026-01-01T00:00:00Z');

export function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'user@example.com',
    password: '$2a$10$hashedpasswordhashedpasswordhashedpasswordhashe',
    name: 'Test User',
    role: 'USER',
    createdAt: CREATED,
    updatedAt: CREATED,
    ...overrides,
  };
}

export function makeVenue(overrides: Partial<Venue> = {}): Venue {
  return {
    venue_id: 'venue-1',
    name: 'Main Hall',
    address: '1 Independence Ave',
    city: 'Accra',
    capacity: 500,
    createdAt: CREATED,
    updatedAt: CREATED,
    ...overrides,
  };
}

export function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    event_id: 'event-1',
    name: 'Rock Night',
    description: 'Loud',
    venue_id: 'venue-1',
    date: new Date('2026-12-01T20:00:00Z'),
    price: 25,
    capacity: 100,
    tickets_reserved: 0,
    createdAt: CREATED,
    updatedAt: CREATED,
    status: 'on_sale',
    performer_id: null,
    ...overrides,
  };
}

export function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    order_id: 'order-1',
    user_id: 'user-1',
    event_id: 'event-1',
    quantity: 2,
    unit_price: 25,
    total_price: 50,
    status: 'pending',
    payment_id: null,
    idempotency_key: 'key-1',
    expires_at: new Date('2026-12-01T00:10:00Z'),
    createdAt: CREATED,
    updatedAt: CREATED,
    ...overrides,
  };
}

export function uniqueViolation(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });
}
