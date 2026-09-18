import type { FeatureDoc, RepoConfig, TestCase } from '@watcher/shared';
import type { FeatureDocDoc, RepoConfigDoc, TestCaseDoc } from '@watcher/shared/models';
import type { HydratedDocument } from 'mongoose';

/**
 * Mongoose document -> API wire shape. Kept explicit (rather than a generic
 * toJSON transform) so it's obvious that webhookSecret never crosses the wire.
 */

export function serializeRepoConfig(doc: HydratedDocument<RepoConfigDoc>): RepoConfig {
  return {
    id: doc.id as string,
    repoUrl: doc.repoUrl,
    fullName: doc.fullName,
    owner: doc.owner,
    name: doc.name,
    targetBranch: doc.targetBranch,
    type: doc.type,
    enabled: doc.enabled,
    hasWebhookSecret: Boolean(doc.webhookSecret),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export function serializeFeatureDoc(doc: HydratedDocument<FeatureDocDoc>): FeatureDoc {
  return {
    id: doc.id as string,
    repoConfigId: String(doc.repoConfigId),
    repoFullName: doc.repoFullName,
    branch: doc.branch,
    content: doc.content,
    lastCommitSha: doc.lastCommitSha,
    revisionCount: doc.revisionCount,
    history: doc.history.map((rev) => ({
      commitSha: rev.commitSha,
      summary: rev.summary,
      previousContent: rev.previousContent,
      model: rev.model,
      createdAt: rev.createdAt.toISOString(),
    })),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export function serializeTestCase(doc: HydratedDocument<TestCaseDoc>): TestCase {
  return {
    id: doc.id as string,
    title: doc.title,
    steps: doc.steps,
    expectedResult: doc.expectedResult,
    status: doc.status,
    kind: doc.kind,
    priority: doc.priority,
    area: doc.area,
    repoConfigId: String(doc.repoConfigId),
    repoFullName: doc.repoFullName,
    commitSha: doc.commitSha,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}
