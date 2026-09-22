import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { fetchBranchHeadSha } from '@watcher/shared/github';
import { FeatureDocModel, RepoConfigModel } from '@watcher/shared/models';
import { env } from '../env.js';
import { logger } from '../logger.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { serializeFeatureDoc } from '../lib/serialize.js';

export const featuresRouter: Router = Router();

/**
 * GET /api/features?repo=owner/name
 * The Features page renders whatever the worker last wrote. Nothing here edits
 * a doc in part -- the docs are LLM-maintained; the one write below replaces a
 * doc whole, from an analysis produced outside the Watcher.
 */
featuresRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const repo = typeof req.query.repo === 'string' ? req.query.repo.toLowerCase() : null;
    const filter = repo ? { repoFullName: repo } : {};

    const docs = await FeatureDocModel.find(filter).sort({ repoFullName: 1 }).exec();
    res.json({ items: docs.map(serializeFeatureDoc), total: docs.length });
  }),
);

/** GET /api/features/:id -- includes the full revision history. */
featuresRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const doc = await FeatureDocModel.findById(req.params.id).exec();
    if (!doc) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.json(serializeFeatureDoc(doc));
  }),
);

// ---------------------------------------------------------------------------
// Baseline ingestion
// ---------------------------------------------------------------------------

const onboardingSchema = z.object({
  repo: z.string().min(1),
  content: z.string().min(1, 'content is required'),
});

/**
 * POST /api/features/onboarding
 *
 * Seeds a repo's documentation with a complete picture of the codebase as it
 * stands today, so incremental push revisions have something to build on.
 *
 * Unlike every other write to a FeatureDoc this is synchronous and has no LLM
 * step: the analysis is produced outside the Watcher (Claude Code, run against
 * the target repo) and posted here as finished text. The only thing the server
 * works out for itself is the commit the baseline describes -- it reads the
 * branch HEAD from GitHub rather than trusting any SHA in the submitted text,
 * so the next push diffs against a commit that really exists.
 *
 * Re-running this on a repo that already has documentation is allowed and
 * deliberate (a resync); the previous content is kept in the history entry.
 */
featuresRouter.post(
  '/onboarding',
  asyncHandler(async (req, res) => {
    const parsed = onboardingSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_body', detail: parsed.error.issues.map((i) => i.message).join('; ') });
      return;
    }

    if (!env.GITHUB_TOKEN) {
      res.status(503).json({
        error: 'github_token_missing',
        detail: 'Set GITHUB_TOKEN in the environment; the baseline needs the branch HEAD from GitHub.',
      });
      return;
    }

    const repoConfig = await findRepoConfig(parsed.data.repo);
    if (!repoConfig) {
      res.status(404).json({ error: 'repo_not_found', detail: parsed.data.repo });
      return;
    }

    let headSha: string;
    try {
      headSha = await fetchBranchHeadSha(
        { token: env.GITHUB_TOKEN, apiBase: env.GITHUB_API_BASE },
        { owner: repoConfig.owner, name: repoConfig.name, branch: repoConfig.targetBranch },
      );
    } catch (err) {
      logger.warn({ err, repo: repoConfig.fullName }, 'baseline ingestion could not read branch HEAD');
      res.status(502).json({
        error: 'github_unavailable',
        detail: `Could not read ${repoConfig.fullName}@${repoConfig.targetBranch} from GitHub. ${(err as Error).message}`,
      });
      return;
    }

    const content = parsed.data.content;
    const existing = await FeatureDocModel.findOne({ repoConfigId: repoConfig.id }).exec();
    const previousContent = existing?.content ?? '';

    const doc = await FeatureDocModel.findOneAndUpdate(
      { repoConfigId: repoConfig.id },
      {
        $set: {
          repoFullName: repoConfig.fullName,
          branch: repoConfig.targetBranch,
          content,
          lastCommitSha: headSha,
        },
        $inc: { revisionCount: 1 },
        $push: {
          history: {
            $each: [
              {
                commitSha: headSha,
                source: 'onboarding' as const,
                summary: previousContent
                  ? `Baseline documentation re-ingested at ${headSha.slice(0, 7)}, replacing the previous content.`
                  : `Baseline documentation ingested at ${headSha.slice(0, 7)}.`,
                previousContent,
                // Written elsewhere and pasted in -- no model ran on this side.
                model: 'external',
                createdAt: new Date(),
              },
            ],
            $slice: -50,
          },
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).exec();

    if (!doc) {
      // Unreachable with upsert+new, but the driver's types allow null.
      res.status(500).json({ error: 'write_failed' });
      return;
    }

    logger.info(
      { repo: repoConfig.fullName, commit: headSha.slice(0, 7), chars: content.length, replaced: Boolean(previousContent) },
      'baseline documentation ingested',
    );

    res.status(existing ? 200 : 201).json(serializeFeatureDoc(doc));
  }),
);

/** Accepts either a RepoConfig id or the repo's `owner/name`. */
async function findRepoConfig(identifier: string) {
  const trimmed = identifier.trim();
  if (Types.ObjectId.isValid(trimmed)) {
    const byId = await RepoConfigModel.findById(trimmed).exec();
    if (byId) return byId;
  }
  return RepoConfigModel.findOne({ fullName: trimmed.toLowerCase() }).exec();
}
