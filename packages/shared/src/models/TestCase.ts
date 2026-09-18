import { Schema, model, type HydratedDocument, type Model } from 'mongoose';
import {
  TEST_CASE_KINDS,
  TEST_CASE_PRIORITIES,
  TEST_CASE_STATUSES,
  type TestCaseKind,
  type TestCasePriority,
  type TestCaseStatus,
} from '../types.js';

export interface TestCaseDoc {
  title: string;
  steps: string[];
  expectedResult: string;
  status: TestCaseStatus;
  kind: TestCaseKind;
  priority: TestCasePriority;
  area: string | null;
  repoConfigId: Schema.Types.ObjectId | string;
  repoFullName: string;
  commitSha: string;
  createdAt: Date;
  updatedAt: Date;
}

const testCaseSchema = new Schema<TestCaseDoc>(
  {
    title: { type: String, required: true, trim: true },
    steps: { type: [String], required: true, default: [] },
    expectedResult: { type: String, required: true, default: '' },
    status: { type: String, required: true, enum: TEST_CASE_STATUSES, default: 'new', index: true },
    kind: { type: String, required: true, enum: TEST_CASE_KINDS, default: 'new' },
    priority: { type: String, required: true, enum: TEST_CASE_PRIORITIES, default: 'medium' },
    area: { type: String, default: null },
    repoConfigId: { type: Schema.Types.ObjectId, ref: 'RepoConfig', required: true, index: true },
    repoFullName: { type: String, required: true, index: true },
    commitSha: { type: String, required: true, index: true },
  },
  { timestamps: true, collection: 'test_cases' },
);

// The QA list is "newest first, filtered by repo/status" -- this covers it.
testCaseSchema.index({ repoFullName: 1, status: 1, createdAt: -1 });

export type TestCaseModel = Model<TestCaseDoc>;
export type TestCaseHydrated = HydratedDocument<TestCaseDoc>;

export const TestCaseModel: TestCaseModel = model<TestCaseDoc>('TestCase', testCaseSchema);
