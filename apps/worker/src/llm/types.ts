import type { TestCaseKind, TestCasePriority } from '@watcher/shared';
import type { RepoDiff } from '../lib/github.js';

/**
 * Input for pass 1. Note `currentContent`: requirement #4 is that the model
 * always receives the stored doc alongside the diff so it revises rather than
 * regenerating. The type makes that non-optional on purpose -- pass an empty
 * string for a repo that has no doc yet.
 */
export interface FeatureDocUpdateInput {
  repoFullName: string;
  repoType: 'frontend' | 'backend';
  branch: string;
  /** The FeatureDoc currently in Mongo. '' on the very first run. */
  currentContent: string;
  diff: RepoDiff;
}

export interface FeatureDocUpdateResult {
  /** The full revised document, ready to store as FeatureDoc.content. */
  content: string;
  /** One or two sentences on what this revision changed, for the history entry. */
  summary: string;
  model: string;
}

/** Input for pass 2. Gets the *updated* doc so test cases match current reality. */
export interface TestCaseGenerationInput {
  repoFullName: string;
  repoType: 'frontend' | 'backend';
  branch: string;
  commitSha: string;
  featureDocContent: string;
  diff: RepoDiff;
}

export interface GeneratedTestCase {
  title: string;
  steps: string[];
  expectedResult: string;
  kind: TestCaseKind;
  priority: TestCasePriority;
  area: string | null;
}

export interface TestCaseGenerationResult {
  testCases: GeneratedTestCase[];
  model: string;
}
