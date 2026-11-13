import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { SqliteEngine } from './backend/sqliteEngine';
import { createApiRouter } from './backend/createApiRouter';

const PORT = Number(process.env.PORT) || 3000;
const isProd = process.env.NODE_ENV === 'production';

async function startServer() {
  const app = express();
  const engine = new SqliteEngine({
    runtime: 'server',
    dataDir: process.env.FLEX_FLOW_DATA_DIR || path.join(process.cwd(), 'data'),
    appVersion: process.env.npm_package_version || '2.0.0',
  });

  app.use('/api', createApiRouter(engine));

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexHtml = path.join(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Build output not found. Run npm run build first.');
      }
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Flex & Flow SQLite Server listening on http://0.0.0.0:${PORT}`);
    console.log(`SQLite Database: ${engine.dbPath}`);
  });

  const shutdown = () => {
    engine.close();
    server.close(() => process.exit(0));
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

startServer().catch((err) => {
  console.error('Failed to start Flex & Flow server:', err);
  process.exit(1);
});
