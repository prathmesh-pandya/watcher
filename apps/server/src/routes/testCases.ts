import { Router } from 'express';
import { z } from 'zod';
import { TEST_CASE_STATUSES } from '@watcher/shared';
import { TestCaseModel } from '@watcher/shared/models';
import { logger } from '../logger.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { serializeTestCase } from '../lib/serialize.js';

export const testCasesRouter: Router = Router();

const listQuerySchema = z.object({
  repo: z.string().optional(),
  status: z.enum(TEST_CASE_STATUSES).optional(),
  commitSha: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

/** GET /api/test-cases?repo=&status=&commitSha=&limit= */
testCasesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_query', detail: parsed.error.issues.map((i) => i.message).join('; ') });
      return;
    }
    const { repo, status, commitSha, limit } = parsed.data;

    const filter: Record<string, unknown> = {};
    if (repo) filter.repoFullName = repo.toLowerCase();
    if (status) filter.status = status;
    if (commitSha) filter.commitSha = commitSha;

    const [docs, total] = await Promise.all([
      TestCaseModel.find(filter).sort({ createdAt: -1 }).limit(limit).exec(),
      TestCaseModel.countDocuments(filter).exec(),
    ]);

    res.json({ items: docs.map(serializeTestCase), total });
  }),
);

const patchSchema = z.object({ status: z.enum(TEST_CASE_STATUSES) });

/**
 * PATCH /api/test-cases/:id
 * The one write the UI is allowed: QA moving a case through new -> in_progress
 * -> done. Content stays owned by the worker.
 */
testCasesRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_body', detail: 'status must be one of: ' + TEST_CASE_STATUSES.join(', ') });
      return;
    }

    const doc = await TestCaseModel.findByIdAndUpdate(
      req.params.id,
      { $set: { status: parsed.data.status } },
      { new: true },
    ).exec();

    if (!doc) {
      res.status(404).json({ error: 'not_found' });
      return;
    }

    logger.info({ testCaseId: doc.id, status: doc.status }, 'test case status changed');
    res.json(serializeTestCase(doc));
  }),
);
