import request from 'supertest';
import { describe, expect, it } from 'vitest';
import app from '../../src/app';
import { prismaMock } from '../setup/prismaMock';

describe('GET /metrics', () => {
  it('exposes Prometheus metrics including recorded HTTP requests', async () => {
    prismaMock.venue.findMany.mockResolvedValue([]);
    await request(app).get('/api/v1/venues');

    const res = await request(app).get('/metrics');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
    expect(res.text).toContain('http_requests_total');
    expect(res.text).toMatch(/http_requests_total\{method="GET",route="[^"]*",status_code="200"\} [1-9]/);
    expect(res.text).toContain('myapp_process_cpu_user_seconds_total');
  });
});
