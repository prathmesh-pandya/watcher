/**
 * Types shared by the API server, the worker and the React app.
 *
 * These describe the *wire* shape of each record (what the REST API returns),
 * which is the Mongoose document with `_id` serialised to a string `id` and
 * dates serialised to ISO strings. The Mongoose schemas in `./models` are the
 * server-side counterpart and are exported from `@watcher/shared/models` so the
 * browser bundle never pulls mongoose in.
 */

/** Which side of the monitored project a repo belongs to. */
export const REPO_TYPES = ['frontend', 'backend'] as const;
export type RepoType = (typeof REPO_TYPES)[number];

/** QA workflow state for a single test case. */
export const TEST_CASE_STATUSES = ['new', 'in_progress', 'done'] as const;
export type TestCaseStatus = (typeof TEST_CASE_STATUSES)[number];

export const TEST_CASE_STATUS_LABELS: Record<TestCaseStatus, string> = {
  new: 'New',
  in_progress: 'In Progress',
  done: 'Done',
};

/** How a test case relates to the change that produced it. */
export const TEST_CASE_KINDS = ['new', 'updated', 'regression'] as const;
export type TestCaseKind = (typeof TEST_CASE_KINDS)[number];

export const TEST_CASE_PRIORITIES = ['low', 'medium', 'high'] as const;
export type TestCasePriority = (typeof TEST_CASE_PRIORITIES)[number];

// ---------------------------------------------------------------------------
// RepoConfig
// ---------------------------------------------------------------------------

/**
 * A monitored *external* repository. Note this is one of the two repos this
 * tool watches, not one of this monorepo's own apps.
 */
export interface RepoConfig {
  id: string;
  /** Clone/browse URL, e.g. https://github.com/acme/storefront-web */
  repoUrl: string;
  /** `owner/name`, derived from repoUrl on save. Unique. */
  fullName: string;
  owner: string;
  name: string;
  /** The single branch we react to; pushes to any other ref are ignored. */
  targetBranch: string;
  type: RepoType;
  /** True when webhook deliveries for this repo should be processed. */
  enabled: boolean;
  /**
   * Never sent to the client. The API returns `hasWebhookSecret` instead so the
   * Settings page can show whether one is configured.
   */
  hasWebhookSecret: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Body accepted by POST /api/repos and PATCH /api/repos/:id. */
export interface RepoConfigInput {
  repoUrl: string;
  targetBranch: string;
  type: RepoType;
  enabled?: boolean;
  /** Write-only. Omit on update to leave the stored secret untouched. */
  webhookSecret?: string;
}

// ---------------------------------------------------------------------------
// FeatureDoc
// ---------------------------------------------------------------------------

/** One revision of a feature doc, appended every time the LLM updates it. */
export interface FeatureDocRevision {
  /** Commit SHA whose diff triggered this revision. */
  commitSha: string;
  /** Short human-readable note from the model about what it changed. */
  summary: string;
  /** Full content *before* this revision was applied, for diffing/rollback. */
  previousContent: string;
  /** Model that produced the revision, e.g. claude-opus-5. */
  model: string;
  createdAt: string;
}

/**
 * The living technical documentation for one monitored repo. There is exactly
 * one FeatureDoc per repo; it is updated incrementally, never regenerated.
 */
export interface FeatureDoc {
  id: string;
  repoConfigId: string;
  repoFullName: string;
  branch: string;
  /** Markdown. The current state of the docs. */
  content: string;
  /** SHA of the most recent commit folded into `content`. */
  lastCommitSha: string | null;
  revisionCount: number;
  history: FeatureDocRevision[];
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// TestCase
// ---------------------------------------------------------------------------

export interface TestCase {
  id: string;
  title: string;
  /** Ordered manual steps a QA engineer follows. */
  steps: string[];
  expectedResult: string;
  status: TestCaseStatus;
  kind: TestCaseKind;
  priority: TestCasePriority;
  /** Free-form area/feature tag the model assigns, for filtering. */
  area: string | null;
  repoConfigId: string;
  repoFullName: string;
  /** The commit whose diff produced this test case. */
  commitSha: string;
  createdAt: string;
  updatedAt: string;
}

/** Body accepted by PATCH /api/test-cases/:id -- QA only toggles status. */
export interface TestCaseStatusInput {
  status: TestCaseStatus;
}

// ---------------------------------------------------------------------------
// Queue payload
// ---------------------------------------------------------------------------

export const PUSH_QUEUE_NAME = 'repo-push';

/**
 * What the webhook route enqueues and the worker consumes. Deliberately small:
 * the worker re-reads anything else it needs from Mongo, so a job sitting in
 * Redis never holds a stale copy of the repo config.
 */
export interface PushJobData {
  repoConfigId: string;
  repoFullName: string;
  repoUrl: string;
  branch: string;
  /** `before` SHA from the push event; all-zeroes when the branch was created. */
  beforeSha: string;
  /** `after` SHA -- the head commit we are documenting. */
  afterSha: string;
  /** GitHub's X-GitHub-Delivery header, carried through for log correlation. */
  deliveryId: string;
  pusher: string | null;
  /** Epoch ms when the webhook was received. */
  receivedAt: number;
}

/**
 * Deterministic BullMQ job id. Gives us first-line idempotency: a redelivered
 * webhook produces the same id and BullMQ refuses the duplicate.
 * The ProcessedEvent collection is the durable second line (see models).
 */
export function pushJobId(repoFullName: string, afterSha: string): string {
  return `${repoFullName}@${afterSha}`;
}

// ---------------------------------------------------------------------------
// API envelopes
// ---------------------------------------------------------------------------

export interface ApiError {
  error: string;
  detail?: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
}
