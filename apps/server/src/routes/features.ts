import { Router } from 'express';
import { FeatureDocModel } from '@watcher/shared/models';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { serializeFeatureDoc } from '../lib/serialize.js';

export const featuresRouter: Router = Router();

/**
 * GET /api/features?repo=owner/name
 * Read-only: the Features page renders whatever the worker last wrote. There is
 * no write endpoint by design -- the docs are LLM-maintained.
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
