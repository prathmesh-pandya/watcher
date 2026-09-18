/*
 * ===========================================================================
 * STUB -- NOT IMPLEMENTED IN THIS PASS
 * ===========================================================================
 *
 * Both functions below are deliberate placeholders. They return well-formed
 * data of the right shape so the end-to-end skeleton (webhook -> queue ->
 * worker -> Mongo -> React) runs and you can watch real data flow, but no
 * Claude API call is made and no prompt engineering has been done yet.
 *
 * To implement:
 *   1. npm i @anthropic-ai/sdk -w @watcher/worker
 *   2. const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
 *   3. Replace each body with a messages.create() call against env.ANTHROPIC_MODEL.
 *
 * Contracts the real implementation must keep:
 *   - updateFeatureDoc MUST send `input.currentContent` in the prompt together
 *     with the diff, and ask for a revision of it. Never regenerate from the
 *     diff alone (requirement #4) -- doing so loses every feature that wasn't
 *     touched by this particular push.
 *   - generateTestCases should ask for structured JSON (a tool call or a
 *     JSON-only response) matching GeneratedTestCase[], and validate it with
 *     zod before it reaches Mongo.
 *   - Both should log token usage and outcome via the caller's logger.
 * ===========================================================================
 */

import { env } from '../env.js';
import { logger } from '../logger.js';
import type {
  FeatureDocUpdateInput,
  FeatureDocUpdateResult,
  TestCaseGenerationInput,
  TestCaseGenerationResult,
} from './types.js';

const STUB_MODEL = 'stub:not-implemented';

/** PASS 1 -- STUB. Incrementally revise the feature documentation. */
export async function updateFeatureDoc(input: FeatureDocUpdateInput): Promise<FeatureDocUpdateResult> {
  logger.warn(
    {
      stub: 'updateFeatureDoc',
      repo: input.repoFullName,
      model: env.ANTHROPIC_MODEL,
      currentDocChars: input.currentContent.length,
      diffChars: input.diff.diff.length,
      changedFiles: input.diff.files.length,
    },
    'LLM STUB: no Claude call made -- appending a placeholder revision',
  );

  const fileList = input.diff.files
    .slice(0, 25)
    .map((f) => `- \`${f.filename}\` (${f.status}, +${f.additions}/-${f.deletions})`)
    .join('\n');

  const header = input.currentContent.trim()
    ? input.currentContent.trimEnd()
    : `# ${input.repoFullName} — Feature Documentation\n\n` +
      `_Watching branch \`${input.branch}\` (${input.repoType}). This document is maintained ` +
      `incrementally: each push revises it rather than rewriting it._`;

  const placeholder =
    `\n\n---\n\n## Pending: ${input.diff.headSha.slice(0, 7)}\n\n` +
    `> **LLM stub.** No documentation was generated for this commit — ` +
    `\`updateFeatureDoc()\` in \`apps/worker/src/llm/client.ts\` is still a stub.\n\n` +
    `Changed files:\n\n${fileList || '- (none reported)'}\n`;

  return {
    content: header + placeholder,
    summary: `Stub revision for ${input.diff.headSha.slice(0, 7)} (${input.diff.files.length} files changed).`,
    model: STUB_MODEL,
  };
}

/** PASS 2 -- STUB. Produce the QA test cases for this change. */
export async function generateTestCases(input: TestCaseGenerationInput): Promise<TestCaseGenerationResult> {
  logger.warn(
    {
      stub: 'generateTestCases',
      repo: input.repoFullName,
      model: env.ANTHROPIC_MODEL,
      diffChars: input.diff.diff.length,
      changedFiles: input.diff.files.length,
    },
    'LLM STUB: no Claude call made -- emitting one placeholder test case',
  );

  return {
    model: STUB_MODEL,
    testCases: [
      {
        title: `[stub] Smoke-test ${input.repoFullName} at ${input.commitSha.slice(0, 7)}`,
        steps: [
          'This is placeholder data produced by the LLM stub, not a real test case.',
          `Implement generateTestCases() in apps/worker/src/llm/client.ts.`,
          `Changed files in this push: ${input.diff.files.map((f) => f.filename).slice(0, 10).join(', ') || 'none'}.`,
        ],
        expectedResult: 'Replace this with a real expected result once the Claude call is implemented.',
        kind: 'new',
        priority: 'medium',
        area: null,
      },
    ],
  };
}
