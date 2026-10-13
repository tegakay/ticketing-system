import request from 'supertest';
import { describe, expect, it } from 'vitest';
import app from '../../src/app';
import { ADMIN, bearer, USER } from '../setup/auth';
import { makeVenue } from '../setup/factories';
import { prismaMock } from '../setup/prismaMock';

const BASE = '/api/v1/venues';
const validVenue = { name: 'Main Hall', address: '1 Independence Ave', city: 'Accra', capacity: 500 };

describe('GET /venues', () => {
  it('is public and lists venues', async () => {
    prismaMock.venue.findMany.mockResolvedValue([makeVenue()]);
    const res = await request(app).get(BASE);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});

describe('GET /venues/:id', () => {
  it('returns a venue', async () => {
    prismaMock.venue.findUnique.mockResolvedValue(makeVenue());
    const res = await request(app).get(`${BASE}/venue-1`);
    expect(res.status).toBe(200);
    expect(res.body.venue_id).toBe('venue-1');
  });

  it('returns 404 for an unknown venue', async () => {
    prismaMock.venue.findUnique.mockResolvedValue(null);
    expect((await request(app).get(`${BASE}/missing`)).status).toBe(404);
  });
});

describe('POST /venues', () => {
  it('requires an admin', async () => {
    expect((await request(app).post(BASE).send(validVenue)).status).toBe(401);
    expect((await request(app).post(BASE).set('Authorization', bearer(USER)).send(validVenue)).status).toBe(403);
  });

  it('creates a venue', async () => {
    prismaMock.venue.create.mockResolvedValue(makeVenue());
    const res = await request(app).post(BASE).set('Authorization', bearer(ADMIN)).send(validVenue);
    expect(res.status).toBe(201);
    expect(prismaMock.venue.create).toHaveBeenCalledWith({ data: validVenue });
  });

  it('returns 400 when city is missing', async () => {
    const { city: _city, ...noCity } = validVenue;
    const res = await request(app).post(BASE).set('Authorization', bearer(ADMIN)).send(noCity);
    expect(res.status).toBe(400);
    expect(prismaMock.venue.create).not.toHaveBeenCalled();
  });
});

describe('PUT /venues/:id', () => {
  it('updates a venue', async () => {
    prismaMock.venue.findUnique.mockResolvedValue(makeVenue());
    prismaMock.venue.update.mockResolvedValue(makeVenue({ capacity: 600 }));
    const res = await request(app).put(`${BASE}/venue-1`).set('Authorization', bearer(ADMIN)).send({ capacity: 600 });
    expect(res.status).toBe(200);
    expect(res.body.capacity).toBe(600);
  });

  it('returns 404 for an unknown venue', async () => {
    prismaMock.venue.findUnique.mockResolvedValue(null);
    const res = await request(app).put(`${BASE}/missing`).set('Authorization', bearer(ADMIN)).send({ capacity: 600 });
    expect(res.status).toBe(404);
    expect(prismaMock.venue.update).not.toHaveBeenCalled();
  });

  it('is forbidden for non-admins', async () => {
    expect((await request(app).put(`${BASE}/venue-1`).set('Authorization', bearer(USER)).send({ capacity: 1 })).status).toBe(403);
  });
});

describe('DELETE /venues/:id', () => {
  it('deletes a venue', async () => {
    prismaMock.venue.findUnique.mockResolvedValue(makeVenue());
    expect((await request(app).delete(`${BASE}/venue-1`).set('Authorization', bearer(ADMIN))).status).toBe(204);
    expect(prismaMock.venue.delete).toHaveBeenCalledWith({ where: { venue_id: 'venue-1' } });
  });

  it('returns 404 for an unknown venue', async () => {
    prismaMock.venue.findUnique.mockResolvedValue(null);
    expect((await request(app).delete(`${BASE}/missing`).set('Authorization', bearer(ADMIN))).status).toBe(404);
    expect(prismaMock.venue.delete).not.toHaveBeenCalled();
  });
});
