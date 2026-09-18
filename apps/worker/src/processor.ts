import type { Job } from 'bullmq';
import type { PushJobData } from '@watcher/shared';
import {
  FeatureDocModel,
  ProcessedEventModel,
  RepoConfigModel,
  TestCaseModel,
  isDuplicateKeyError,
} from '@watcher/shared/models';
import { logger } from './logger.js';
import { fetchPushDiff } from './lib/github.js';
import { generateTestCases, updateFeatureDoc } from './llm/client.js';

export interface ProcessResult {
  skipped?: 'duplicate' | 'repo_missing' | 'repo_disabled' | 'empty_diff';
  featureDocId?: string;
  testCasesCreated?: number;
}

export async function processPushJob(job: Job<PushJobData>): Promise<ProcessResult> {
  const { repoConfigId, repoFullName, branch, beforeSha, afterSha, deliveryId } = job.data;
  const log = logger.child({ jobId: job.id, deliveryId, repo: repoFullName, commit: afterSha.slice(0, 7) });

  log.info({ branch, beforeSha: beforeSha.slice(0, 7), attempt: job.attemptsMade + 1 }, 'job started');

  // --- idempotency claim (requirement #2) ---------------------------------
  const claimId = await claimEvent(repoFullName, afterSha, deliveryId);
  if (!claimId) {
    log.info('job skipped: commit already processed');
    return { skipped: 'duplicate' };
  }

  try {
    const repoConfig = await RepoConfigModel.findById(repoConfigId).exec();
    if (!repoConfig) {
      log.warn('job skipped: repo config no longer exists');
      await finish(claimId, 'succeeded', { note: 'repo_missing' });
      return { skipped: 'repo_missing' };
    }
    if (!repoConfig.enabled) {
      log.info('job skipped: repo disabled since enqueue');
      await finish(claimId, 'succeeded', { note: 'repo_disabled' });
      return { skipped: 'repo_disabled' };
    }

    // --- 1. fetch the diff -------------------------------------------------
    const diff = await fetchPushDiff({
      owner: repoConfig.owner,
      name: repoConfig.name,
      beforeSha,
      afterSha,
    });
    log.info(
      { files: diff.files.length, diffChars: diff.diff.length, truncated: diff.truncated },
      'diff fetched',
    );

    if (diff.files.length === 0 && !diff.diff.trim()) {
      log.info('job skipped: push contained no file changes');
      await finish(claimId, 'succeeded', { note: 'empty_diff' });
      return { skipped: 'empty_diff' };
    }

    // --- 2. feature docs: read current, send it WITH the diff, merge back ---
    // Requirement #4 lives here: `currentContent` is always passed to the model.
    const existingDoc = await FeatureDocModel.findOne({ repoConfigId: repoConfig.id }).exec();
    const currentContent = existingDoc?.content ?? '';

    const docResult = await updateFeatureDoc({
      repoFullName: repoConfig.fullName,
      repoType: repoConfig.type,
      branch,
      currentContent,
      diff,
    });
    log.info({ model: docResult.model, chars: docResult.content.length }, 'feature doc revision produced');

    const featureDoc = await FeatureDocModel.findOneAndUpdate(
      { repoConfigId: repoConfig.id },
      {
        $set: {
          repoFullName: repoConfig.fullName,
          branch,
          content: docResult.content,
          lastCommitSha: afterSha,
        },
        $inc: { revisionCount: 1 },
        $push: {
          history: {
            $each: [
              {
                commitSha: afterSha,
                summary: docResult.summary,
                previousContent: currentContent,
                model: docResult.model,
                createdAt: new Date(),
              },
            ],
            // Keep the history bounded so the document can't outgrow Mongo's
            // 16MB limit after a few hundred pushes.
            $slice: -50,
          },
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).exec();

    // --- 3. test cases -----------------------------------------------------
    const testResult = await generateTestCases({
      repoFullName: repoConfig.fullName,
      repoType: repoConfig.type,
      branch,
      commitSha: afterSha,
      featureDocContent: docResult.content,
      diff,
    });
    log.info({ model: testResult.model, count: testResult.testCases.length }, 'test cases produced');

    let created = 0;
    if (testResult.testCases.length > 0) {
      const inserted = await TestCaseModel.insertMany(
        testResult.testCases.map((tc) => ({
          ...tc,
          status: 'new' as const,
          repoConfigId: repoConfig.id,
          repoFullName: repoConfig.fullName,
          commitSha: afterSha,
        })),
      );
      created = inserted.length;
    }

    await finish(claimId, 'succeeded', { featureDocUpdated: true, testCasesCreated: created });
    log.info({ featureDocId: featureDoc?.id, testCasesCreated: created }, 'job succeeded');

    return { featureDocId: featureDoc?.id as string | undefined, testCasesCreated: created };
  } catch (err) {
    log.error({ err }, 'job failed');
    // Mark the claim failed rather than deleting it: the row is the audit
    // trail, and claimEvent() lets a retry (or a later redelivery) take a
    // failed claim back over. Only *succeeded* rows dedupe permanently.
    await finish(claimId, 'failed', { error: (err as Error).message }).catch(() => undefined);
    throw err;
  }
}

/** A crashed worker leaves a 'processing' row behind; reclaim it after this. */
const STALE_CLAIM_MS = 15 * 60_000;

/**
 * Takes ownership of (repoFullName, commitSha), or returns null when someone
 * else already owns it. The unique index is what makes this safe across
 * concurrent workers -- two simultaneous inserts race, only one survives.
 *
 * A row is reclaimable when it previously failed, or when it has been stuck in
 * 'processing' past STALE_CLAIM_MS. A 'succeeded' row is never reclaimable,
 * which is what makes a redelivery days later still a no-op.
 */
async function claimEvent(repoFullName: string, commitSha: string, deliveryId: string): Promise<string | null> {
  const now = new Date();

  try {
    const doc = await ProcessedEventModel.create({
      repoFullName,
      commitSha,
      deliveryId,
      status: 'processing',
      startedAt: now,
    });
    return doc.id as string;
  } catch (err) {
    if (!isDuplicateKeyError(err)) throw err;
  }

  const reclaimed = await ProcessedEventModel.findOneAndUpdate(
    {
      repoFullName,
      commitSha,
      $or: [
        { status: 'failed' },
        { status: 'processing', startedAt: { $lt: new Date(now.getTime() - STALE_CLAIM_MS) } },
      ],
    },
    { $set: { status: 'processing', startedAt: now, finishedAt: null, error: null, deliveryId } },
    { new: true },
  ).exec();

  return reclaimed ? (reclaimed.id as string) : null;
}

async function finish(
  id: string,
  status: 'succeeded' | 'failed',
  extra: { error?: string; note?: string; featureDocUpdated?: boolean; testCasesCreated?: number } = {},
): Promise<void> {
  await ProcessedEventModel.updateOne(
    { _id: id },
    {
      $set: {
        status,
        finishedAt: new Date(),
        error: extra.error ?? null,
        featureDocUpdated: extra.featureDocUpdated ?? false,
        testCasesCreated: extra.testCasesCreated ?? 0,
      },
    },
  ).exec();
}
