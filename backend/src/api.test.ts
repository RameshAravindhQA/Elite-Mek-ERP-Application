import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function createQuery(result: any) {
  const query: any = {};
  const chain = () => query;
  query.from = chain;
  query.where = chain;
  query.limit = chain;
  query.offset = chain;
  query.orderBy = chain;
  query.returning = chain;
  query.values = chain;
  query.set = chain;
  query.then = (resolve: any) => Promise.resolve(result).then(resolve);
  query.catch = () => query;
  return query;
}

function setApiTestState(state: Partial<{ selectResults: any[]; insertResult: any; updateResult: any; deleteResult: any }>) {
  const existing = (globalThis as any).__apiTestState ?? {
    selectResults: [],
    insertResult: [],
    updateResult: [],
    deleteResult: [],
  };
  (globalThis as any).__apiTestState = { ...existing, ...state };
}

vi.mock('@workspace/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@workspace/db')>();

  const usersTable = { id: 'id', email: 'email', passwordHash: 'passwordHash', role: 'role', name: 'name', avatar: 'avatar', phone: 'phone', createdAt: 'createdAt' };
  const rolesTable = { name: 'name', permissions: 'permissions' };
  const customersTable = { id: 'id', name: 'name', email: 'email', phone: 'phone', status: 'status', createdAt: 'createdAt' };
  const auditLogsTable = { id: 'id', module: 'module', action: 'action', recordId: 'recordId', userId: 'userId', createdAt: 'createdAt' };

  const select = vi.fn(() => createQuery((globalThis as any).__apiTestState?.selectResults?.shift() ?? []));
  const insert = vi.fn(() => createQuery((globalThis as any).__apiTestState?.insertResult ?? []));
  const update = vi.fn(() => createQuery((globalThis as any).__apiTestState?.updateResult ?? []));
  const remove = vi.fn(() => createQuery((globalThis as any).__apiTestState?.deleteResult ?? []));
  const query = vi.fn(() => Promise.resolve({ rows: [{ '?column?': 1 }] }));

  ;(globalThis as any).__testDbHandles = {
    select,
    insert,
    update,
    delete: remove,
  };
  ;(globalThis as any).__testPoolHandles = {
    query,
  };

  return {
    ...actual,
    db: { select, insert, update, delete: remove },
    pool: { query },
    usersTable,
    rolesTable,
    customersTable,
    auditLogsTable,
  };
});

vi.mock('@workspace/db/drizzle', () => ({
  eq: vi.fn(),
  or: vi.fn(),
  and: vi.fn(),
  ilike: vi.fn(),
  desc: vi.fn(),
  count: vi.fn(() => 1),
  sql: vi.fn(),
}));

vi.mock('../lib/audit.js', () => ({
  createAuditLog: vi.fn(),
}));

import app from './app';
import { generateToken, hashPassword } from './lib/auth.js';

const defaultUser = {
  id: 1,
  name: 'Test User',
  email: 'test@example.com',
  role: 'admin',
  passwordHash: hashPassword('password123'),
  avatar: null,
  phone: null,
  createdAt: new Date(),
};

beforeEach(() => {
  (globalThis as any).__apiTestState = {
    selectResults: [],
    insertResult: [],
    updateResult: [],
    deleteResult: [],
  };
  const handles = (globalThis as any).__testDbHandles ?? {};
  const poolHandles = (globalThis as any).__testPoolHandles ?? {};
  handles.select?.mockClear();
  handles.insert?.mockClear();
  handles.update?.mockClear();
  handles.delete?.mockClear();
  poolHandles.query?.mockClear();
});

describe('Backend API integration tests', () => {
  it('returns 200 for GET /api/healthz', async () => {
    const response = await request(app).get('/api/healthz');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('returns 200 for GET /api/db/ping using the database pool', async () => {
    const response = await request(app).get('/api/db/ping');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok', db: 'connected' });
    const poolHandles = (globalThis as any).__testPoolHandles ?? {};
    expect(poolHandles.query).toHaveBeenCalledWith('SELECT 1');
  });

  it('returns 400 for POST /api/auth/login when email or password is missing', async () => {
    const response = await request(app).post('/api/auth/login').send({ email: 'test@example.com' });
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: 'Validation failed' });
    expect(response.body.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'password', message: 'Required' }),
      ]),
    );
  });

  it('returns 401 for POST /api/auth/login with invalid credentials', async () => {
    setApiTestState({ selectResults: [[]] });
    const response = await request(app).post('/api/auth/login').send({ email: 'test@example.com', password: 'wrongpass' });
    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Invalid credentials' });
  });

  it('returns 200 for POST /api/auth/login with valid credentials', async () => {
    setApiTestState({ selectResults: [[defaultUser]] });
    const response = await request(app).post('/api/auth/login').send({ email: 'test@example.com', password: 'password123' });
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('token');
    expect(response.body).toHaveProperty('user');
    expect(response.body.user).toEqual(expect.objectContaining({ id: 1, name: 'Test User', email: 'test@example.com', role: 'admin' }));
  });

  it('returns 401 for GET /api/auth/me without Authorization header', async () => {
    const response = await request(app).get('/api/auth/me');
    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Unauthorized' });
  });

  it('returns 401 for GET /api/auth/me with invalid token', async () => {
    const response = await request(app).get('/api/auth/me').set('Authorization', 'Bearer invalid-token');
    expect(response.status).toBe(401);
    expect(['Invalid token', 'User not found']).toContain(response.body.error);
  });

  it('returns 200 for GET /api/auth/me with valid token and existing user', async () => {
    setApiTestState({ selectResults: [[defaultUser], [], [defaultUser]] });
    const token = generateToken(1, 'test@example.com');
    const response = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body).toEqual(expect.objectContaining({ id: 1, name: 'Test User', email: 'test@example.com', role: 'admin' }));
  });

  it('returns 401 for GET /api/customers without auth token', async () => {
    const response = await request(app).get('/api/customers');
    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Unauthorized' });
  });

  it('returns 200 for GET /api/customers with auth token and empty results', async () => {
    setApiTestState({ selectResults: [[defaultUser], [], [{ total: 0 }], []] });
    const token = generateToken(1, 'test@example.com');
    const response = await request(app).get('/api/customers').set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
    expect(response.body.pagination).toEqual({ page: 1, limit: 20, total: 0, totalPages: 0 });
  });

  it('returns 201 for POST /api/customers with auth token and valid body', async () => {
    setApiTestState({ selectResults: [[defaultUser], []], insertResult: [{ id: 123, name: 'Acme Corp', email: 'acme@example.com', phone: '1234567890', status: 'active', totalOrders: 0, totalRevenue: '0', createdAt: new Date() }] });
    const token = generateToken(1, 'test@example.com');
    const response = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Acme Corp', email: 'acme@example.com', phone: '1234567890', status: 'active' });

    expect(response.status).toBe(201);
    expect(response.body).toEqual(expect.objectContaining({ id: 123, name: 'Acme Corp', email: 'acme@example.com', phone: '1234567890', status: 'active' }));
  });

  it('returns 404 for GET /api/customers/foo when the id is invalid or not found', async () => {
    setApiTestState({ selectResults: [[defaultUser], [], []] });
    const token = generateToken(1, 'test@example.com');
    const response = await request(app).get('/api/customers/foo').set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Not found' });
  });

  it('returns filtered record-level audit logs', async () => {
    const auditLog = {
      id: 77,
      module: 'employees',
      action: 'update',
      recordId: 123,
      userId: 1,
      userName: 'Test User',
      description: 'Updated employee',
      oldValues: { status: 'inactive' },
      newValues: { status: 'active' },
      ipAddress: '127.0.0.1',
      createdAt: new Date('2026-05-17T10:00:00.000Z'),
    };
    setApiTestState({ selectResults: [[defaultUser], [], [{ total: 1 }], [auditLog]] });
    const token = generateToken(1, 'test@example.com');
    const response = await request(app)
      .get('/api/audit-logs?module=employees&action=update&recordId=123&userId=1')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toEqual(expect.objectContaining({
      id: 77,
      module: 'employees',
      action: 'update',
      recordId: 123,
      userId: 1,
    }));
    expect(response.body.pagination).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
  });

  it('accepts overtime UI payload IDs before auth is checked', async () => {
    const response = await request(app)
      .post('/api/overtime')
      .send({ employeeId: '1', projectId: '2', workDate: '2026-05-17', hours: 8, proofUrl: '', notes: '' });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Unauthorized' });
  });

  it('accepts advance payment UI payload IDs before auth is checked', async () => {
    const response = await request(app)
      .post('/api/advance-payments')
      .send({ employeeId: '1', paymentDate: '2026-05-17', deductionMonth: '2026-05', amount: 2000, status: 'pending', paymentMode: '', referenceNo: '', notes: '' });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Unauthorized' });
  });

  it('accepts bulk work allocation payloads before auth is checked', async () => {
    const response = await request(app)
      .post('/api/work-allocation')
      .send({ projectId: '3', employeeIds: ['1', 2] });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Unauthorized' });
  });
});
