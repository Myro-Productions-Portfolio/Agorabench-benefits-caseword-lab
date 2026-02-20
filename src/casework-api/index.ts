import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import path from 'path';
import { config } from './config';
import { errorHandler, requestLogger } from './middleware/index';
import { initWebSocket } from './websocket';
import { API_PREFIX } from '@shared/constants';
import apiRouter from './routes/index';
import { loadPolicyPack } from '@core/policy-pack';

const app = express();
const server = createServer(app);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: config.clientUrl, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

app.use(API_PREFIX, apiRouter);

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

async function start() {
  const packDir = path.resolve('policy-packs/snap-illinois-fy2026-v1');
  const policyPack = await loadPolicyPack(packDir);
  console.warn(
    `[POLICY] Loaded ${policyPack.meta.packId} (${policyPack.ruleIndex.size} rules)`,
  );
  app.locals.policyPack = policyPack;

  server.listen(config.port, () => {
    console.warn(
      `[SERVER] Benefits Casework Lab API on port ${config.port}`,
    );
    console.warn(
      `[SERVER] Health: http://localhost:${config.port}${API_PREFIX}/health`,
    );
  });
}

start().catch((err) => {
  console.error('[SERVER] Failed to start:', err);
  process.exit(1);
});

export { app, server };
