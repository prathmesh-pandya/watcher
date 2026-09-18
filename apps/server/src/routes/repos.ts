import { Router } from 'express';
import { z } from 'zod';
import { REPO_TYPES, parseRepoUrl } from '@watcher/shared';
import { RepoConfigModel, isDuplicateKeyError } from '@watcher/shared/models';
import { logger } from '../logger.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { serializeRepoConfig } from '../lib/serialize.js';

export const reposRouter: Router = Router();

const createSchema = z.object({
  repoUrl: z.string().min(1),
  targetBranch: z.string().min(1).default('main'),
  type: z.enum(REPO_TYPES),
  enabled: z.boolean().optional(),
  webhookSecret: z.string().min(1).optional(),
});

const updateSchema = createSchema.partial();

/** GET /api/repos */
reposRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const docs = await RepoConfigModel.find().sort({ createdAt: 1 }).exec();
    res.json({ items: docs.map(serializeRepoConfig), total: docs.length });
  }),
);

/** POST /api/repos -- register one of the two external repos to watch. */
reposRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_body', detail: parsed.error.issues.map((i) => i.message).join('; ') });
      return;
    }

    const repo = parseRepoUrl(parsed.data.repoUrl);
    if (!repo) {
      res.status(400).json({ error: 'invalid_repo_url', detail: 'Expected a GitHub URL or owner/name.' });
      return;
    }

    try {
      const doc = await RepoConfigModel.create({
        repoUrl: parsed.data.repoUrl.trim(),
        fullName: repo.fullName.toLowerCase(),
        owner: repo.owner,
        name: repo.name,
        targetBranch: parsed.data.targetBranch,
        type: parsed.data.type,
        enabled: parsed.data.enabled ?? true,
        webhookSecret: parsed.data.webhookSecret,
      });
      logger.info({ fullName: doc.fullName, branch: doc.targetBranch }, 'repo config created');
      res.status(201).json(serializeRepoConfig(doc));
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        res.status(409).json({ error: 'repo_already_configured', detail: repo.fullName });
        return;
      }
      throw err;
    }
  }),
);

/** PATCH /api/repos/:id -- omit webhookSecret to keep the stored one. */
reposRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_body', detail: parsed.error.issues.map((i) => i.message).join('; ') });
      return;
    }

    const doc = await RepoConfigModel.findById(req.params.id).select('+webhookSecret').exec();
    if (!doc) {
      res.status(404).json({ error: 'not_found' });
      return;
    }

    if (parsed.data.repoUrl !== undefined) {
      const repo = parseRepoUrl(parsed.data.repoUrl);
      if (!repo) {
        res.status(400).json({ error: 'invalid_repo_url' });
        return;
      }
      doc.repoUrl = parsed.data.repoUrl.trim();
      doc.fullName = repo.fullName.toLowerCase();
      doc.owner = repo.owner;
      doc.name = repo.name;
    }
    if (parsed.data.targetBranch !== undefined) doc.targetBranch = parsed.data.targetBranch;
    if (parsed.data.type !== undefined) doc.type = parsed.data.type;
    if (parsed.data.enabled !== undefined) doc.enabled = parsed.data.enabled;
    if (parsed.data.webhookSecret) doc.webhookSecret = parsed.data.webhookSecret;

    await doc.save();
    logger.info({ fullName: doc.fullName }, 'repo config updated');
    res.json(serializeRepoConfig(doc));
  }),
);

/** DELETE /api/repos/:id */
reposRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const doc = await RepoConfigModel.findByIdAndDelete(req.params.id).exec();
    if (!doc) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    logger.info({ fullName: doc.fullName }, 'repo config deleted');
    res.status(204).end();
  }),
);
