# EliteMek Backend-Only Windows Startup

Use this when you want to run only the API server on a local Windows machine.

## Prerequisites

- Node.js 20 or newer
- pnpm installed globally with `npm install -g pnpm`, or Corepack enabled with `corepack enable`
- PostgreSQL running locally
- Database URL in `.env`

Default local database:

```bat
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres
```

## Start Backend Only

Double-click:

```bat
start-backend.bat
```

The backend-only starter will:

- install workspace dependencies if `node_modules` is missing;
- run the database schema push when `RUN_SCHEMA_PUSH=1`;
- ensure `admin@elitemek.com / admin123` exists when `ENSURE_ADMIN_LOGIN=1`;
- stop an existing listener on `BACKEND_START_PORT` when `KILL_OCCUPIED_PORTS=1`;
- start only the backend API.

Default API URL:

```text
http://localhost:3000/api
```

Health check:

```text
http://localhost:3000/api/healthz
```

## Useful `.env` Options

```bat
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres
BACKEND_START_PORT=3000
RUN_SCHEMA_PUSH=1
ENSURE_ADMIN_LOGIN=1
KILL_OCCUPIED_PORTS=1
```

Set `RUN_SCHEMA_PUSH=0` only when the database schema is already updated.
