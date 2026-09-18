import { Router, raw } from 'express';
import { branchFromRef, pushJobId, type PushJobData } from '@watcher/shared';
import { RepoConfigModel } from '@watcher/shared/models';
import { env } from '../env.js';
import { logger } from '../logger.js';
import { pushQueue } from '../lib/queue.js';
import { verifyGithubSignature } from '../lib/signature.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

export const webhookRouter: Router = Router();

/** Shape of the bits of GitHub's push payload we care about. */
interface PushPayload {
  ref?: string;
  before?: string;
  after?: string;
  deleted?: boolean;
  repository?: { full_name?: string; html_url?: string };
  pusher?: { name?: string };
}

/**
 * POST /webhooks/github
 *
 * Requirement #1: this handler must finish in a couple of seconds. It does
 * exactly four things -- verify, filter, enqueue, 200 -- and never touches the
 * GitHub compare API or the Claude API. All of that happens in apps/worker.
 *
 * Note this route is NOT behind requireApiToken; the HMAC signature is the
 * authentication. It is mounted with express.raw() so the signature is checked
 * against the original bytes.
 */
webhookRouter.post(
  '/github',
  raw({ type: 'application/json', limit: '10mb' }),
  asyncHandler(async (req, res) => {
    const deliveryId = req.get('x-github-delivery') ?? 'unknown';
    const event = req.get('x-github-event') ?? 'unknown';
    const signature = req.get('x-hub-signature-256') ?? undefined;
    const log = logger.child({ deliveryId, event, route: 'webhook' });

    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    log.info({ bytes: rawBody.length }, 'webhook received');

    // GitHub pings the endpoint once when the hook is created.
    if (event === 'ping') {
      // We still verify below for a push; for ping we can't know the repo
      // secret cheaply enough to be worth it, so just acknowledge.
      res.status(200).json({ ok: true, pong: true });
      return;
    }

    if (event !== 'push') {
      log.debug('ignored: not a push event');
      res.status(202).json({ ok: true, ignored: 'unsupported_event' });
      return;
    }

    // Parse before verifying ONLY to learn which repo this is, so we can look
    // up that repo's secret. Nothing from this parse is trusted or persisted
    // until the signature check below passes.
    let payload: PushPayload;
    try {
      payload = JSON.parse(rawBody.toString('utf8')) as PushPayload;
    } catch {
      log.warn('rejected: body is not valid JSON');
      res.status(400).json({ error: 'invalid_json' });
      return;
    }

    const fullName = payload.repository?.full_name?.toLowerCase();
    if (!fullName) {
      log.warn('rejected: payload has no repository.full_name');
      res.status(400).json({ error: 'missing_repository' });
      return;
    }

    const repoConfig = await RepoConfigModel.findOne({ fullName }).select('+webhookSecret').exec();
    if (!repoConfig) {
      log.warn({ fullName }, 'rejected: repo is not configured');
      res.status(404).json({ error: 'repo_not_configured' });
      return;
    }

    const secret = repoConfig.webhookSecret || env.GITHUB_WEBHOOK_SECRET;
    if (!secret) {
      log.error({ fullName }, 'rejected: no webhook secret for repo and no GITHUB_WEBHOOK_SECRET fallback');
      res.status(500).json({ error: 'no_webhook_secret' });
      return;
    }

    if (!verifyGithubSignature(rawBody, signature, secret)) {
      log.warn({ fullName }, 'rejected: signature mismatch');
      res.status(401).json({ error: 'invalid_signature' });
      return;
    }

    if (!repoConfig.enabled) {
      log.info({ fullName }, 'ignored: repo disabled');
      res.status(202).json({ ok: true, ignored: 'repo_disabled' });
      return;
    }

    // --- branch filter: we watch exactly one branch per repo ---------------
    const branch = branchFromRef(payload.ref ?? '');
    if (!branch) {
      log.debug({ ref: payload.ref }, 'ignored: ref is not a branch');
      res.status(202).json({ ok: true, ignored: 'not_a_branch' });
      return;
    }
    if (branch !== repoConfig.targetBranch) {
      log.debug({ branch, targetBranch: repoConfig.targetBranch }, 'ignored: branch not watched');
      res.status(202).json({ ok: true, ignored: 'branch_not_watched' });
      return;
    }

    if (payload.deleted) {
      log.info({ branch }, 'ignored: branch deleted');
      res.status(202).json({ ok: true, ignored: 'branch_deleted' });
      return;
    }

    const afterSha = payload.after ?? '';
    if (!afterSha) {
      log.warn('rejected: push payload has no after SHA');
      res.status(400).json({ error: 'missing_after_sha' });
      return;
    }

    // --- enqueue and return ------------------------------------------------
    const jobData: PushJobData = {
      repoConfigId: repoConfig.id as string,
      repoFullName: repoConfig.fullName,
      repoUrl: repoConfig.repoUrl,
      branch,
      beforeSha: payload.before ?? '',
      afterSha,
      deliveryId,
      pusher: payload.pusher?.name ?? null,
      receivedAt: Date.now(),
    };

    // Deterministic job id = first-line idempotency (requirement #2). BullMQ
    // silently drops an add() whose job id already exists, so a GitHub
    // redelivery of the same push never gets processed twice. We look first
    // purely so the log and the response can say which happened.
    const jobId = pushJobId(repoConfig.fullName, afterSha);
    const existing = await pushQueue.getJob(jobId);

    if (existing) {
      log.info({ fullName, branch, afterSha, jobId }, 'duplicate delivery ignored');
      res.status(200).json({ ok: true, jobId, deduped: true, repo: repoConfig.fullName, commit: afterSha });
      return;
    }

    await pushQueue.add('process-push', jobData, { jobId });
    log.info({ fullName, branch, afterSha, jobId, pusher: jobData.pusher }, 'push enqueued');

    res.status(200).json({ ok: true, jobId, deduped: false, repo: repoConfig.fullName, branch, commit: afterSha });
  }),
);
