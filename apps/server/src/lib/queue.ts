import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { PUSH_QUEUE_NAME, type PushJobData } from '@watcher/shared';
import { env } from '../env.js';

/**
 * BullMQ requires maxRetriesPerRequest: null on the connection it owns.
 * The server only ever *produces* jobs; the worker app consumes them.
 */
export const redis = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });

export const pushQueue = new Queue<PushJobData>(PUSH_QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5_000 },
    // Keep a window of finished jobs so a redelivery within that window is
    // rejected by job id before it ever reaches the worker.
    removeOnComplete: { age: 24 * 3600, count: 500 },
    removeOnFail: { age: 7 * 24 * 3600 },
  },
});

export async function closeQueue(): Promise<void> {
  await pushQueue.close();
  redis.disconnect();
}
