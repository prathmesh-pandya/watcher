// Must come first: populates process.env before env.ts validates it.
import './loadEnv.js';
import { Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';
import { PUSH_QUEUE_NAME, type PushJobData } from '@watcher/shared';
import { connectMongo, disconnectMongo } from '@watcher/shared/models';
import { env } from './env.js';
import { logger } from './logger.js';
import { processPushJob } from './processor.js';

async function main(): Promise<void> {
  await connectMongo({
    uri: env.MONGO_URI,
    onEvent: (event, detail) => logger.info({ event, detail }, 'mongo'),
  });

  const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });

  const worker = new Worker<PushJobData>(PUSH_QUEUE_NAME, (job: Job<PushJobData>) => processPushJob(job), {
    connection,
    concurrency: env.WORKER_CONCURRENCY,
    // A job that outlives this stalls and is retried by another worker.
    lockDuration: 5 * 60_000,
  });

  worker.on('completed', (job, result) => {
    logger.info({ jobId: job.id, repo: job.data.repoFullName, result }, 'job completed');
  });
  worker.on('failed', (job, err) => {
    logger.error(
      { jobId: job?.id, repo: job?.data.repoFullName, attempt: (job?.attemptsMade ?? 0), err },
      'job failed',
    );
  });
  worker.on('error', (err) => logger.error({ err }, 'worker error'));
  worker.on('stalled', (jobId) => logger.warn({ jobId }, 'job stalled'));

  logger.info({ queue: PUSH_QUEUE_NAME, concurrency: env.WORKER_CONCURRENCY }, 'worker listening');

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'shutting down');
    // Let in-flight jobs finish before closing.
    await worker.close();
    connection.disconnect();
    await disconnectMongo().catch((err) => logger.error({ err }, 'mongo disconnect failed'));
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error({ err }, 'worker failed to start');
  process.exit(1);
});
