// Must come first: populates process.env before env.ts validates it.
import './loadEnv.js';
import { connectMongo, disconnectMongo } from '@watcher/shared/models';
import { createApp } from './app.js';
import { env } from './env.js';
import { logger } from './logger.js';
import { closeQueue } from './lib/queue.js';

async function main(): Promise<void> {
  await connectMongo({
    uri: env.MONGO_URI,
    onEvent: (event, detail) => logger.info({ event, detail }, 'mongo'),
  });

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'server listening');
  });

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'shutting down');
    server.close(async () => {
      await closeQueue().catch((err) => logger.error({ err }, 'queue close failed'));
      await disconnectMongo().catch((err) => logger.error({ err }, 'mongo disconnect failed'));
      process.exit(0);
    });
    // Don't hang forever on in-flight connections.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error({ err }, 'server failed to start');
  process.exit(1);
});
