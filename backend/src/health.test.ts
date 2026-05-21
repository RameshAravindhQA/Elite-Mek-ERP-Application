import request from 'supertest';
import { describe, expect, it } from 'vitest';
import app from './app';

describe('Health API', () => {
  it('returns 200 for /api/healthz', async () => {
    const response = await request(app).get('/api/healthz');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('returns 200 for /api/health', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('returns success for /api/auth/logout', async () => {
    const response = await request(app).post('/api/auth/logout');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true });
  });

  it('returns 404 for unknown routes under /api', async () => {
    const response = await request(app).get('/api/unknown-route');
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.body).toBeDefined();
  });
});
