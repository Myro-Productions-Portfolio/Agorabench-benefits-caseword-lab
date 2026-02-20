# M0 Bootstrap Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Bootstrap the Benefits Casework Lab repo with skeleton services, Docker infrastructure, and a minimal UI that creates cases and displays events in real-time.

**Architecture:** Single-package TypeScript project with module-based boundaries: `casework-core/` (pure logic), `casework-api/` (Express HTTP), `casework-worker/` (Bull jobs), `casework-ui/` (React frontend), plus shared `db/` and `shared/` layers. Docker Compose for Postgres (5436) and Redis (6381). WebSocket broadcast on event insert.

**Tech Stack:** pnpm, TypeScript (ESM), Express, Drizzle ORM + postgres.js, Bull + ioredis, ws, React 18, Vite 6, TailwindCSS 3, Zod, Vitest

**Exit criteria:** Create a case via UI button, see CASE_CREATED event appear in real-time event log.

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.env.example`
- Create: `.env`
- Create: `src/shared/constants.ts`
- Create: `src/shared/types.ts`

**Step 1: Create package.json**

```json
{
  "name": "benefits-casework-lab",
  "version": "0.1.0",
  "private": true,
  "description": "AI agent benchmarking for institutional government benefits casework",
  "type": "module",
  "scripts": {
    "dev": "concurrently \"pnpm dev:server\" \"pnpm dev:client\"",
    "dev:client": "vite",
    "dev:server": "tsx watch src/casework-api/index.ts",
    "build": "tsc -b && vite build",
    "start": "node dist/casework-api/index.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint src/ --ext .ts,.tsx",
    "typecheck": "tsc --noEmit",
    "format": "prettier --write \"src/**/*.{ts,tsx,css}\"",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio",
    "docker:up": "docker compose up -d",
    "docker:down": "docker compose down"
  },
  "dependencies": {
    "bull": "^4.16.5",
    "cors": "^2.8.5",
    "dotenv": "^16.5.0",
    "drizzle-orm": "^0.39.3",
    "express": "^4.21.2",
    "helmet": "^8.1.0",
    "ioredis": "^5.6.1",
    "morgan": "^1.10.0",
    "pg": "^8.13.3",
    "postgres": "^3.4.5",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "uuid": "^11.1.0",
    "ws": "^8.18.1",
    "zod": "^3.24.2"
  },
  "devDependencies": {
    "@eslint/js": "^9.20.0",
    "@tailwindcss/forms": "^0.5.10",
    "@types/cors": "^2.8.17",
    "@types/express": "^5.0.0",
    "@types/morgan": "^1.9.9",
    "@types/node": "^22.13.1",
    "@types/pg": "^8.11.11",
    "@types/react": "^18.3.18",
    "@types/react-dom": "^18.3.5",
    "@types/uuid": "^10.0.0",
    "@types/ws": "^8.18.0",
    "@vitejs/plugin-react": "^4.3.4",
    "autoprefixer": "^10.4.20",
    "concurrently": "^9.1.2",
    "drizzle-kit": "^0.30.5",
    "eslint": "^9.20.0",
    "postcss": "^8.5.2",
    "prettier": "^3.4.2",
    "tailwindcss": "^3.4.17",
    "tsx": "^4.19.2",
    "typescript": "^5.7.3",
    "vite": "^6.1.0",
    "vitest": "^3.0.5"
  },
  "engines": {
    "node": ">=20.0.0",
    "pnpm": ">=9.0.0"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "baseUrl": ".",
    "paths": {
      "@shared/*": ["src/shared/*"],
      "@core/*": ["src/casework-core/*"],
      "@api/*": ["src/casework-api/*"],
      "@worker/*": ["src/casework-worker/*"],
      "@ui/*": ["src/casework-ui/*"],
      "@db/*": ["src/db/*"]
    }
  },
  "include": ["src/**/*", "tests/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 3: Create .env.example and .env**

`.env.example`:
```
NODE_ENV=development
PORT=3001
CLIENT_URL=http://localhost:5173

DATABASE_URL=postgresql://casework:casework_dev_2026@localhost:5436/benefits_casework
REDIS_URL=redis://localhost:6381
```

Copy to `.env` with same values.

**Step 4: Create src/shared/constants.ts**

```typescript
export const API_PREFIX = '/api';

export const WS_EVENTS = {
  CONNECTION_ESTABLISHED: 'connection_established',
  HEARTBEAT: 'heartbeat',
  EVENT_CREATED: 'event_created',
} as const;

export const CASE_STATUSES = [
  'RECEIVED',
  'PENDING_VERIFICATION',
  'READY_FOR_DETERMINATION',
  'DETERMINED_APPROVED',
  'DETERMINED_DENIED',
  'NOTICE_SENT',
  'APPEAL_REQUESTED',
  'APPEAL_DECIDED',
  'IMPLEMENTED',
] as const;

export const EVENT_ACTIONS = [
  'CASE_CREATED',
  'STATUS_CHANGED',
  'DOCUMENT_REQUESTED',
  'DOCUMENT_RECEIVED',
  'DETERMINATION_MADE',
  'NOTICE_GENERATED',
  'APPEAL_FILED',
  'APPEAL_DECIDED',
] as const;
```

**Step 5: Create src/shared/types.ts**

```typescript
import type { CASE_STATUSES, EVENT_ACTIONS, WS_EVENTS } from './constants';

export type CaseStatus = (typeof CASE_STATUSES)[number];
export type EventAction = (typeof EVENT_ACTIONS)[number];

export interface CaseRecord {
  id: string;
  program: string;
  jurisdiction: string | null;
  status: CaseStatus;
  createdAt: string;
  updatedAt: string;
}

export interface EventRecord {
  id: string;
  caseId: string;
  actor: string;
  action: EventAction;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

export interface WsMessage {
  event: (typeof WS_EVENTS)[keyof typeof WS_EVENTS];
  data: unknown;
  timestamp: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
```

**Step 6: Install dependencies**

Run: `pnpm install`

**Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml tsconfig.json .env.example .gitignore src/shared/
git commit -m "feat: project scaffolding with shared types and constants"
```

---

### Task 2: Docker Compose + Drizzle Config

**Files:**
- Create: `docker-compose.yml`
- Create: `drizzle.config.ts`

**Step 1: Create docker-compose.yml**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: casework-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: casework
      POSTGRES_PASSWORD: casework_dev_2026
      POSTGRES_DB: benefits_casework
    ports:
      - "5436:5432"
    volumes:
      - casework_pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U casework -d benefits_casework"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: casework-redis
    restart: unless-stopped
    ports:
      - "6381:6379"
    volumes:
      - casework_redis:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  casework_pgdata:
    name: casework_pgdata
  casework_redis:
    name: casework_redis
```

**Step 2: Create drizzle.config.ts**

```typescript
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgresql://casework:casework_dev_2026@localhost:5436/benefits_casework',
  },
  verbose: true,
  strict: true,
});
```

**Step 3: Start Docker containers**

Run: `pnpm docker:up`
Verify: `docker ps` shows both containers healthy.

**Step 4: Commit**

```bash
git add docker-compose.yml drizzle.config.ts
git commit -m "infra: docker compose for postgres and redis, drizzle config"
```

---

### Task 3: Database Schema + Connection

**Files:**
- Create: `src/db/schema/cases.ts`
- Create: `src/db/schema/events.ts`
- Create: `src/db/schema/index.ts`
- Create: `src/db/connection.ts`
- Create: `tests/db/schema.test.ts`

**Step 1: Write the failing test**

`tests/db/schema.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { cases } from '../../src/db/schema/cases';
import { events } from '../../src/db/schema/events';

describe('cases schema', () => {
  it('exports a cases table', () => {
    expect(cases).toBeDefined();
    expect((cases as any)[Symbol.for('drizzle:Name')]).toBe('cases');
  });
});

describe('events schema', () => {
  it('exports an events table', () => {
    expect(events).toBeDefined();
    expect((events as any)[Symbol.for('drizzle:Name')]).toBe('events');
  });

  it('has a foreign key to cases', () => {
    const caseIdCol = events.caseId;
    expect(caseIdCol).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/db/schema.test.ts`
Expected: FAIL — modules don't exist yet.

**Step 3: Create src/db/schema/cases.ts**

```typescript
import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';

export const cases = pgTable('cases', {
  id: uuid('id').primaryKey().defaultRandom(),
  program: text('program').notNull().default('SNAP'),
  jurisdiction: text('jurisdiction'),
  status: text('status').notNull().default('RECEIVED'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
```

**Step 4: Create src/db/schema/events.ts**

```typescript
import { pgTable, uuid, text, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { cases } from './cases';

export const events = pgTable('events', {
  id: uuid('id').primaryKey().defaultRandom(),
  caseId: uuid('case_id').notNull().references(() => cases.id),
  actor: text('actor').notNull(),
  action: text('action').notNull(),
  payload: jsonb('payload'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

**Step 5: Create src/db/schema/index.ts**

```typescript
export { cases } from './cases';
export { events } from './events';
```

**Step 6: Create src/db/connection.ts**

```typescript
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index';

const DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://casework:casework_dev_2026@localhost:5436/benefits_casework';

const queryClient = postgres(DATABASE_URL, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db = drizzle(queryClient, { schema });

export async function testConnection(): Promise<boolean> {
  try {
    await queryClient`SELECT 1`;
    return true;
  } catch (error) {
    console.error('Database connection failed:', error);
    return false;
  }
}

export { queryClient };
```

**Step 7: Run test to verify it passes**

Run: `pnpm test -- tests/db/schema.test.ts`
Expected: PASS

**Step 8: Push schema to database**

Run: `pnpm db:push`
Expected: Drizzle pushes `cases` and `events` tables to Postgres.

**Step 9: Commit**

```bash
git add src/db/ tests/db/
git commit -m "feat: database schema (cases, events) and connection"
```

---

### Task 4: Server Setup (Express + WebSocket)

**Files:**
- Create: `src/casework-api/config.ts`
- Create: `src/casework-api/websocket.ts`
- Create: `src/casework-api/index.ts`
- Create: `src/casework-api/middleware/index.ts`

**Step 1: Create src/casework-api/config.ts**

```typescript
import 'dotenv/config';

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  database: {
    url: process.env.DATABASE_URL || 'postgresql://casework:casework_dev_2026@localhost:5436/benefits_casework',
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6381',
  },
  isDev: (process.env.NODE_ENV || 'development') === 'development',
  isProd: process.env.NODE_ENV === 'production',
} as const;
```

**Step 2: Create src/casework-api/middleware/index.ts**

```typescript
import type { Request, Response, NextFunction } from 'express';
import morgan from 'morgan';

export const requestLogger = morgan('dev');

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  console.error('[ERROR]', err.message);
  res.status(500).json({ success: false, error: err.message });
}
```

**Step 3: Create src/casework-api/websocket.ts**

```typescript
import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { WS_EVENTS } from '@shared/constants';
import type { WsMessage } from '@shared/types';

let wss: WebSocketServer | null = null;

export function initWebSocket(server: Server): WebSocketServer {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket) => {
    console.warn('[WS] Client connected');

    const msg: WsMessage = {
      event: WS_EVENTS.CONNECTION_ESTABLISHED,
      data: { message: 'Connected to Benefits Casework Lab' },
      timestamp: new Date().toISOString(),
    };
    ws.send(JSON.stringify(msg));

    const heartbeat = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          event: WS_EVENTS.HEARTBEAT,
          data: null,
          timestamp: new Date().toISOString(),
        }));
      }
    }, 30000);

    ws.on('close', () => { console.warn('[WS] Client disconnected'); clearInterval(heartbeat); });
    ws.on('error', (err) => { console.error('[WS] Error:', err.message); clearInterval(heartbeat); });
  });

  console.warn('[WS] WebSocket server initialized on /ws');
  return wss;
}

export function broadcast(event: string, data: unknown): void {
  if (!wss) return;
  const message: WsMessage = { event, data, timestamp: new Date().toISOString() };
  const payload = JSON.stringify(message);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  });
}
```

**Step 4: Create src/casework-api/index.ts**

```typescript
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import path from 'path';
import { config } from './config';
import { errorHandler, requestLogger } from './middleware/index';
import { initWebSocket } from './websocket';
import { API_PREFIX } from '@shared/constants';

const app = express();
const server = createServer(app);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: config.clientUrl, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

// Routes placeholder — added in Task 5
// app.use(API_PREFIX, apiRouter);

if (config.isProd) {
  const clientDist = path.resolve(process.cwd(), 'dist/client');
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use(errorHandler);

initWebSocket(server);

function shutdown(signal: string) {
  console.warn(`[SERVER] ${signal} received — shutting down`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

server.listen(config.port, () => {
  console.warn(`[SERVER] Benefits Casework Lab API on port ${config.port}`);
  console.warn(`[SERVER] Health: http://localhost:${config.port}${API_PREFIX}/health`);
});

export { app, server };
```

**Step 5: Verify server starts**

Run: `pnpm dev:server`
Expected: Server starts on port 3001, WebSocket initialized.
Stop with Ctrl+C.

**Step 6: Commit**

```bash
git add src/casework-api/
git commit -m "feat(api): express server with websocket and middleware"
```

---

### Task 5: API Routes (Health, Cases, Events)

**Files:**
- Create: `src/casework-api/routes/health.ts`
- Create: `src/casework-api/routes/cases.ts`
- Create: `src/casework-api/routes/index.ts`
- Modify: `src/casework-api/index.ts` (uncomment router)
- Create: `tests/casework-api/routes/health.test.ts`
- Create: `tests/casework-api/routes/cases.test.ts`

**Step 1: Write failing test for health route**

`tests/casework-api/routes/health.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import healthRouter from '../../../src/casework-api/routes/health';

describe('health router', () => {
  it('exports a router', () => {
    expect(healthRouter).toBeDefined();
    expect(healthRouter.stack).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/casework-api/routes/health.test.ts`
Expected: FAIL

**Step 3: Create src/casework-api/routes/health.ts**

```typescript
import { Router } from 'express';
import { testConnection } from '@db/connection';

const router = Router();

router.get('/health', async (_req, res) => {
  const dbOk = await testConnection();
  const status = dbOk ? 'healthy' : 'degraded';
  res.status(dbOk ? 200 : 503).json({
    success: dbOk,
    data: {
      status,
      timestamp: new Date().toISOString(),
      version: '0.1.0',
      services: { database: dbOk ? 'connected' : 'disconnected' },
    },
  });
});

export default router;
```

**Step 4: Run health test**

Run: `pnpm test -- tests/casework-api/routes/health.test.ts`
Expected: PASS

**Step 5: Write failing test for cases route**

`tests/casework-api/routes/cases.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import casesRouter from '../../../src/casework-api/routes/cases';

describe('cases router', () => {
  it('exports a router', () => {
    expect(casesRouter).toBeDefined();
    expect(casesRouter.stack).toBeDefined();
  });
});
```

**Step 6: Run test to verify it fails**

Run: `pnpm test -- tests/casework-api/routes/cases.test.ts`
Expected: FAIL

**Step 7: Create src/casework-api/routes/cases.ts**

```typescript
import { Router } from 'express';
import { db } from '@db/connection';
import { cases } from '@db/schema/cases';
import { events } from '@db/schema/events';
import { eq, desc } from 'drizzle-orm';
import { broadcast } from '@api/websocket';
import { WS_EVENTS } from '@shared/constants';

const router = Router();

// List all cases
router.get('/cases', async (_req, res) => {
  const rows = await db.select().from(cases).orderBy(desc(cases.createdAt));
  res.json({ success: true, data: rows });
});

// Get case with events
router.get('/cases/:id', async (req, res) => {
  const [row] = await db.select().from(cases).where(eq(cases.id, req.params.id));
  if (!row) return res.status(404).json({ success: false, error: 'Case not found' });
  const caseEvents = await db.select().from(events).where(eq(events.caseId, row.id)).orderBy(events.createdAt);
  res.json({ success: true, data: { ...row, events: caseEvents } });
});

// Get events for a case
router.get('/cases/:id/events', async (req, res) => {
  const rows = await db.select().from(events).where(eq(events.caseId, req.params.id)).orderBy(events.createdAt);
  res.json({ success: true, data: rows });
});

// Create a case (auto-logs CASE_CREATED event)
router.post('/cases', async (_req, res) => {
  const [newCase] = await db.insert(cases).values({}).returning();
  const [event] = await db.insert(events).values({
    caseId: newCase.id,
    actor: 'system',
    action: 'CASE_CREATED',
    payload: { program: newCase.program, status: newCase.status },
  }).returning();
  broadcast(WS_EVENTS.EVENT_CREATED, event);
  res.status(201).json({ success: true, data: { case: newCase, event } });
});

// Log an event on a case
router.post('/cases/:id/events', async (req, res) => {
  const { actor, action, payload } = req.body;
  if (!actor || !action) return res.status(400).json({ success: false, error: 'actor and action required' });
  const [row] = await db.select().from(cases).where(eq(cases.id, req.params.id));
  if (!row) return res.status(404).json({ success: false, error: 'Case not found' });
  const [event] = await db.insert(events).values({
    caseId: req.params.id,
    actor,
    action,
    payload: payload ?? null,
  }).returning();
  broadcast(WS_EVENTS.EVENT_CREATED, event);
  res.status(201).json({ success: true, data: event });
});

export default router;
```

**Step 8: Create src/casework-api/routes/index.ts**

```typescript
import { Router } from 'express';
import healthRouter from './health';
import casesRouter from './cases';

const router = Router();
router.use(healthRouter);
router.use(casesRouter);

export default router;
```

**Step 9: Wire router into src/casework-api/index.ts**

Replace the routes placeholder comment block with:

```typescript
import apiRouter from './routes/index';
```

And uncomment:
```typescript
app.use(API_PREFIX, apiRouter);
```

**Step 10: Run all tests**

Run: `pnpm test`
Expected: All PASS

**Step 11: Manual smoke test**

Run: `pnpm dev:server`
Run in another terminal:
```bash
curl -s http://localhost:3001/api/health | jq
curl -s -X POST http://localhost:3001/api/cases | jq
curl -s http://localhost:3001/api/cases | jq
```
Expected: health returns healthy, POST creates a case, GET lists it.

**Step 12: Commit**

```bash
git add src/casework-api/routes/ tests/casework-api/
git commit -m "feat(api): routes for health, cases, and events with WS broadcast"
```

---

### Task 6: Casework Core + Worker Stubs

**Files:**
- Create: `src/casework-core/index.ts`
- Create: `src/casework-worker/index.ts`

These modules are mostly empty in M0 but establishing the directories now ensures the module boundaries exist from day one.

**Step 1: Create src/casework-core/index.ts**

```typescript
// casework-core: Pure logic — state machine, validators, oracle, scoring
// No HTTP, no side effects. All functions are pure and testable.
//
// Populated in M1+ milestones:
// - stateMachine.ts: Case state transitions + validators
// - oracle.ts: Deterministic rules engine
// - scoring.ts: Scoring interface

export const CASEWORK_CORE_VERSION = '0.1.0';
```

**Step 2: Create src/casework-worker/index.ts**

```typescript
// casework-worker: Bull job queues
// Tick execution, queue routing, deadlines, benchmark runner.
//
// Populated in M2+ milestones:
// - jobs/tickProcessor.ts: Case tick execution
// - jobs/benchmarkRunner.ts: Isolated benchmark runs

export const CASEWORK_WORKER_VERSION = '0.1.0';
```

**Step 3: Commit**

```bash
git add src/casework-core/ src/casework-worker/
git commit -m "feat: casework-core and casework-worker module stubs"
```

---

### Task 7: Vite + TailwindCSS + Client Skeleton

**Files:**
- Create: `vite.config.ts`
- Create: `tailwind.config.ts`
- Create: `postcss.config.js`
- Create: `index.html`
- Create: `src/casework-ui/styles/index.css`
- Create: `src/casework-ui/lib/api.ts`
- Create: `src/casework-ui/lib/websocket.ts`
- Create: `src/casework-ui/main.tsx`
- Create: `src/casework-ui/App.tsx`

**Step 1: Create vite.config.ts**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  root: '.',
  publicDir: 'public',
  resolve: {
    alias: {
      '@ui': path.resolve(__dirname, 'src/casework-ui'),
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@core': path.resolve(__dirname, 'src/casework-core'),
      '@api': path.resolve(__dirname, 'src/casework-api'),
      '@worker': path.resolve(__dirname, 'src/casework-worker'),
      '@db': path.resolve(__dirname, 'src/db'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
      '/ws': { target: 'ws://localhost:3001', ws: true },
    },
  },
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
    sourcemap: true,
  },
});
```

**Step 2: Create tailwind.config.ts**

```typescript
import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/casework-ui/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [require('@tailwindcss/forms')],
} satisfies Config;
```

**Step 3: Create postcss.config.js**

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

**Step 4: Create index.html**

```html
<!DOCTYPE html>
<html lang="en" class="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Benefits Casework Lab</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
  </head>
  <body class="bg-gray-950 text-gray-100">
    <div id="root"></div>
    <script type="module" src="/src/casework-ui/main.tsx"></script>
  </body>
</html>
```

**Step 5: Create src/casework-ui/styles/index.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

**Step 6: Create src/casework-ui/lib/api.ts**

```typescript
import { API_PREFIX } from '@shared/constants';
import type { ApiResponse } from '@shared/types';

const BASE = API_PREFIX;

async function request<T>(path: string, options?: RequestInit): Promise<ApiResponse<T>> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  return res.json();
}

export const api = {
  getCases: () => request('/cases'),
  getCase: (id: string) => request(`/cases/${id}`),
  getCaseEvents: (id: string) => request(`/cases/${id}/events`),
  createCase: () => request('/cases', { method: 'POST' }),
  createEvent: (caseId: string, body: { actor: string; action: string; payload?: unknown }) =>
    request(`/cases/${caseId}/events`, { method: 'POST', body: JSON.stringify(body) }),
};
```

**Step 7: Create src/casework-ui/lib/websocket.ts**

```typescript
import { WS_EVENTS } from '@shared/constants';
import type { WsMessage } from '@shared/types';

type EventHandler = (data: unknown) => void;

let ws: WebSocket | null = null;
const handlers = new Map<string, Set<EventHandler>>();

export function connectWebSocket(): void {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${protocol}//${window.location.host}/ws`;
  ws = new WebSocket(url);

  ws.onmessage = (e) => {
    const msg: WsMessage = JSON.parse(e.data);
    if (msg.event === WS_EVENTS.HEARTBEAT) return;
    const fns = handlers.get(msg.event);
    if (fns) fns.forEach((fn) => fn(msg.data));
  };

  ws.onclose = () => {
    setTimeout(connectWebSocket, 3000);
  };
}

export function onEvent(event: string, handler: EventHandler): () => void {
  if (!handlers.has(event)) handlers.set(event, new Set());
  handlers.get(event)!.add(handler);
  return () => handlers.get(event)?.delete(handler);
}
```

**Step 8: Create src/casework-ui/main.tsx**

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './styles/index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

**Step 9: Create src/casework-ui/App.tsx (placeholder)**

```tsx
export function App() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <h1 className="text-2xl font-semibold">Benefits Casework Lab</h1>
    </div>
  );
}
```

**Step 10: Verify client starts**

Run: `pnpm dev:client`
Expected: Vite dev server starts on 5173, shows the heading in browser.

**Step 11: Commit**

```bash
git add vite.config.ts tailwind.config.ts postcss.config.js index.html src/casework-ui/
git commit -m "feat(ui): vite client skeleton with tailwind, api client, and websocket"
```

---

### Task 8: Event Log UI Page (Exit Criteria)

**Files:**
- Create: `src/casework-ui/pages/EventLog.tsx`
- Modify: `src/casework-ui/App.tsx`

**Step 1: Create src/casework-ui/pages/EventLog.tsx**

```tsx
import { useEffect, useState } from 'react';
import { api } from '@ui/lib/api';
import { connectWebSocket, onEvent } from '@ui/lib/websocket';
import { WS_EVENTS } from '@shared/constants';
import type { EventRecord } from '@shared/types';

export function EventLog() {
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(false);

  // Load all events on mount
  useEffect(() => {
    (async () => {
      const res = await api.getCases();
      if (res.success && Array.isArray(res.data)) {
        const allEvents: EventRecord[] = [];
        for (const c of res.data as any[]) {
          const evRes = await api.getCaseEvents(c.id);
          if (evRes.success && Array.isArray(evRes.data)) {
            allEvents.push(...(evRes.data as EventRecord[]));
          }
        }
        allEvents.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setEvents(allEvents);
      }
    })();
  }, []);

  // Subscribe to real-time events
  useEffect(() => {
    connectWebSocket();
    const unsub = onEvent(WS_EVENTS.EVENT_CREATED, (data) => {
      setEvents((prev) => [data as EventRecord, ...prev]);
    });
    return unsub;
  }, []);

  const handleCreateCase = async () => {
    setLoading(true);
    await api.createCase();
    setLoading(false);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold">Benefits Casework Lab</h1>
        <button
          onClick={handleCreateCase}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded-md transition-colors"
        >
          {loading ? 'Creating...' : 'Create Case'}
        </button>
      </div>

      <h2 className="text-lg font-medium mb-4 text-gray-400">Event Log</h2>

      {events.length === 0 ? (
        <p className="text-gray-500 text-sm">No events yet. Create a case to get started.</p>
      ) : (
        <ul className="space-y-2">
          {events.map((ev) => (
            <li key={ev.id} className="bg-gray-900 border border-gray-800 rounded-md px-4 py-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-mono font-medium text-blue-400">{ev.action}</span>
                <span className="text-xs text-gray-500">
                  {new Date(ev.createdAt).toLocaleTimeString()}
                </span>
              </div>
              <div className="text-xs text-gray-400">
                <span className="text-gray-500">actor:</span> {ev.actor}
                <span className="ml-3 text-gray-500">case:</span> {ev.caseId.slice(0, 8)}...
              </div>
              {ev.payload && (
                <pre className="mt-2 text-xs text-gray-500 font-mono overflow-x-auto">
                  {JSON.stringify(ev.payload, null, 2)}
                </pre>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

**Step 2: Update src/casework-ui/App.tsx**

```tsx
import { EventLog } from './pages/EventLog';

export function App() {
  return <EventLog />;
}
```

**Step 3: Full integration test**

Run: `pnpm dev` (starts both server and client concurrently)
Open: http://localhost:5173
1. Page loads showing "No events yet."
2. Click "Create Case"
3. CASE_CREATED event appears in the list in real-time (via WebSocket)
4. Refresh page — event persists (loaded from API)

**Step 4: Commit**

```bash
git add src/casework-ui/
git commit -m "feat(ui): event log page with real-time websocket updates — M0 complete"
```

---

### Task 9: Push to GitHub

**Step 1: Push**

```bash
git push -u origin main
```

**Step 2: Verify**

Open: https://github.com/Myro-Productions-Portfolio/Agorabench-benefits-caseword-lab
Confirm all files visible.
