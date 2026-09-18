import { Schema, model, type Model } from 'mongoose';

/**
 * Durable idempotency ledger for requirement #2 (dedupe on repo + commit SHA).
 *
 * The BullMQ job id gives us cheap dedupe at enqueue time, but that only holds
 * while the job is retained in Redis -- a redelivery hours later, or after a
 * Redis flush, would sail through. The worker therefore *claims* the
 * (repoFullName, commitSha) pair here inside a unique index before doing any
 * work; a duplicate claim throws E11000 and the job exits as a no-op.
 */
export interface ProcessedEventDoc {
  repoFullName: string;
  commitSha: string;
  deliveryId: string;
  status: 'processing' | 'succeeded' | 'failed';
  error: string | null;
  featureDocUpdated: boolean;
  testCasesCreated: number;
  startedAt: Date;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const processedEventSchema = new Schema<ProcessedEventDoc>(
  {
    repoFullName: { type: String, required: true },
    commitSha: { type: String, required: true },
    deliveryId: { type: String, required: true, default: '' },
    status: { type: String, required: true, enum: ['processing', 'succeeded', 'failed'], default: 'processing' },
    error: { type: String, default: null },
    featureDocUpdated: { type: Boolean, required: true, default: false },
    testCasesCreated: { type: Number, required: true, default: 0 },
    startedAt: { type: Date, required: true, default: () => new Date() },
    finishedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'processed_events' },
);

processedEventSchema.index({ repoFullName: 1, commitSha: 1 }, { unique: true });

export type ProcessedEventModel = Model<ProcessedEventDoc>;

export const ProcessedEventModel: ProcessedEventModel = model<ProcessedEventDoc>(
  'ProcessedEvent',
  processedEventSchema,
);
