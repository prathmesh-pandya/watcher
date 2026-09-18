/*
 * Pass 1 (updateFeatureDoc) calls MiniMax-M3 for real, through MiniMax's
 * OpenAI-compatible /v1/chat/completions endpoint -- hence the `openai`
 * package pointed at a different baseURL rather than any custom HTTP or auth.
 * Pass 2 (generateTestCases) is still a stub -- see the banner above it.
 */

import OpenAI from 'openai';
import { z } from 'zod';
import { TEST_CASE_KINDS, TEST_CASE_PRIORITIES } from '@watcher/shared';
import { env } from '../env.js';
import { logger } from '../logger.js';
import type {
  FeatureDocUpdateInput,
  FeatureDocUpdateResult,
  TestCaseGenerationInput,
  TestCaseGenerationResult,
} from './types.js';

/** Placeholder shipped in .env.example; a real key never looks like this. */
const PLACEHOLDER_API_KEY = 'replace-me-with-your-minimax-key';

/**
 * Generous enough for a full feature doc returned verbatim. A truncated
 * document would silently corrupt the stored doc, so finish_reason is checked
 * below rather than trusted.
 */
const MAX_TOKENS = 16_000;

const FEATURE_DOC_SYSTEM_PROMPT = `You are maintaining internal technical documentation for a software
repository. You will be given a git diff and the current version of the
feature documentation for this repository (or told that no documentation
exists yet). Your job is to produce the complete, updated documentation
as it should read after this diff is applied.

Rules:
- The audience is technical (engineers, QA), not end users. Describe
  what the code does and how, not marketing language.
- Only document things you can actually infer from the diff you're
  given. Do not invent features, edge cases, or behavior the diff
  doesn't show evidence of.
- If existing documentation describes something the diff doesn't
  touch, keep it as-is unless the diff clearly makes it inaccurate
  (e.g. removes the feature).
- If the diff only contains non-functional changes (formatting,
  comments, refactors with no behavior change, dependency bumps),
  return the existing documentation completely unchanged.
- If no existing documentation is provided, write a complete first
  version based only on what this diff shows — don't claim broader
  functionality you haven't seen.
- Output ONLY the documentation content in markdown. No preamble, no
  explanation of what changed, no meta-commentary about the diff
  itself — the output IS the document, not a description of an edit.`;

let cachedClient: OpenAI | null = null;

/**
 * Fails loudly on a missing or placeholder key rather than firing a request
 * that is guaranteed to 401.
 */
function getClient(): OpenAI {
  const apiKey = env.MINIMAX_API_KEY;

  if (!apiKey || apiKey === PLACEHOLDER_API_KEY) {
    throw new Error(
      `MINIMAX_API_KEY is ${apiKey ? 'still the placeholder value' : 'not set'}. ` +
        'Set a real key in the root .env before the worker can generate feature docs.',
    );
  }

  cachedClient ??= new OpenAI({ apiKey, baseURL: env.MINIMAX_BASE_URL });
  return cachedClient;
}

/**
 * `thinking` is a MiniMax extension to the OpenAI chat-completions body, so it
 * isn't in the SDK's types. Declaring it here keeps the call type-checked
 * instead of reaching for `any`; the SDK forwards unknown fields as-is.
 */
type MiniMaxChatParams = OpenAI.Chat.ChatCompletionCreateParamsNonStreaming & {
  thinking?: { type: 'disabled' | 'adaptive' };
};

/**
 * Defensive only. Thinking is disabled on the request, so this should never
 * fire; it exists so a provider-side default change degrades into a slightly
 * odd document rather than reasoning text stored as documentation.
 */
function stripThinkBlock(text: string): string {
  if (!text.includes('<think>')) return text;
  const closing = text.lastIndexOf('</think>');
  return closing === -1 ? text : text.slice(closing + '</think>'.length);
}

/** The diff arrives already capped at MAX_DIFF_CHARS upstream; not re-truncated here. */
function buildUserMessage(input: FeatureDocUpdateInput): string {
  const existingDocs = input.currentContent.trim()
    ? input.currentContent
    : 'No existing documentation — this is the first revision.';

  return [
    `Repository: ${input.repoFullName}`,
    `Branch: ${input.branch}`,
    `Commit: ${input.diff.headSha}`,
    '',
    '## Current feature documentation',
    '',
    existingDocs,
    '',
    '## Git diff for this push',
    '',
    input.diff.diff,
  ].join('\n');
}

/**
 * PASS 1 -- incrementally revise the feature documentation.
 *
 * Sends the current stored document alongside the diff so the model revises it
 * rather than regenerating from the diff alone. API errors are deliberately not
 * caught: BullMQ's retry/backoff on the job is the retry mechanism.
 */
export async function updateFeatureDoc(input: FeatureDocUpdateInput): Promise<FeatureDocUpdateResult> {
  const client = getClient();
  const model = env.MINIMAX_MODEL;

  const params: MiniMaxChatParams = {
    model,
    max_tokens: MAX_TOKENS,
    messages: [
      { role: 'system', content: FEATURE_DOC_SYSTEM_PROMPT },
      { role: 'user', content: buildUserMessage(input) },
    ],
    // MiniMax-M3 defaults to adaptive thinking and would otherwise fold
    // reasoning into the reply. We want only the finished document.
    thinking: { type: 'disabled' },
  };

  logger.info(
    { repo: input.repoFullName, model, pass: 'feature-doc', promptChars: params.messages.reduce((n, m) => n + String(m.content).length, 0) },
    'MiniMax call started',
  );

  let response;
  try {
    response = await client.chat.completions.create(params);
  } catch (err) {
    // Rethrown untouched -- BullMQ's retry/backoff still owns the retry.
    logger.error({ repo: input.repoFullName, model, pass: 'feature-doc', err }, 'MiniMax call failed');
    throw err;
  }

  logger.info(
    {
      repo: input.repoFullName,
      model,
      pass: 'feature-doc',
      inputTokens: response.usage?.prompt_tokens,
      outputTokens: response.usage?.completion_tokens,
    },
    'MiniMax call succeeded',
  );

  const choice = response.choices[0];
  if (!choice) {
    throw new Error(`MiniMax returned no choices for ${input.repoFullName}.`);
  }

  // Saving a half-written document would corrupt the stored doc, since the
  // processor overwrites content wholesale. Fail instead.
  if (choice.finish_reason === 'length') {
    throw new Error(
      `Feature doc for ${input.repoFullName} hit the ${MAX_TOKENS}-token output cap and would have ` +
        'been saved truncated. Raise MAX_TOKENS or shorten the stored document.',
    );
  }

  if (choice.finish_reason === 'content_filter') {
    throw new Error(`MiniMax content filter blocked the feature doc for ${input.repoFullName}.`);
  }

  const content = stripThinkBlock(choice.message.content ?? '');

  if (!content.trim()) {
    throw new Error(`MiniMax returned an empty feature doc for ${input.repoFullName}.`);
  }

  logger.info(
    {
      repo: input.repoFullName,
      model,
      finishReason: choice.finish_reason,
      inputTokens: response.usage?.prompt_tokens,
      outputTokens: response.usage?.completion_tokens,
      docChars: content.length,
    },
    'feature doc revision ready',
  );

  return {
    // Returned exactly as received -- no trimming, wrapping or reformatting.
    content,
    // The model is instructed to emit only the document, so the history note is
    // composed here from the diff metadata rather than asked for separately.
    summary: `Revised for ${input.diff.headSha.slice(0, 7)} (${input.diff.files.length} file${
      input.diff.files.length === 1 ? '' : 's'
    } changed).`,
    model,
  };
}

const TEST_CASE_SYSTEM_PROMPT = `You are writing manual QA test cases for a software change.

You will be given the current feature documentation for a repository and the
git diff that was just pushed. Produce the test cases a QA engineer should run
for this change.

Rules:
- Each test case must be executable by hand against a running application.
  Steps are concrete UI or API actions, not instructions to read code.
- Base the test cases on behavior the diff actually changes. Use the feature
  documentation for surrounding context so steps can reference real screens,
  fields and flows, but do not write cases for behavior this diff doesn't touch.
- Prefer a small number of meaningful cases over exhaustive permutations.
  Return between 1 and 8 test cases.
- "kind" is "new" for behavior this diff introduces, "updated" for behavior it
  changes, and "regression" for existing behavior at risk of breaking.
- "area" is a short feature/screen label used for grouping, or null.
- If the diff is purely non-functional (formatting, comments, dependency bumps,
  refactors with no behavior change), return an empty testCases array.

Output ONLY a JSON object, with no markdown fences and no commentary, in
exactly this shape:

{
  "testCases": [
    {
      "title": "string",
      "steps": ["string", "..."],
      "expectedResult": "string",
      "kind": "new" | "updated" | "regression",
      "priority": "low" | "medium" | "high",
      "area": "string or null"
    }
  ]
}`;

/**
 * Validates the model's JSON before anything reaches Mongo. The enums are the
 * shared constants the TestCase schema itself uses, so a value that parses here
 * cannot be rejected by Mongoose later.
 */
const generatedTestCaseSchema = z.object({
  title: z.string().min(1),
  steps: z.array(z.string().min(1)).min(1),
  expectedResult: z.string().min(1),
  kind: z.enum(TEST_CASE_KINDS),
  priority: z.enum(TEST_CASE_PRIORITIES),
  area: z.string().min(1).nullable().catch(null),
});

const testCaseResponseSchema = z.object({
  testCases: z.array(generatedTestCaseSchema).max(20),
});

/** Models often wrap JSON in ```json fences despite being told not to. */
function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  return trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/, '')
    .trim();
}

function buildTestCaseUserMessage(input: TestCaseGenerationInput): string {
  const docs = input.featureDocContent.trim()
    ? input.featureDocContent
    : 'No feature documentation available yet.';

  return [
    `Repository: ${input.repoFullName} (${input.repoType})`,
    `Branch: ${input.branch}`,
    `Commit: ${input.commitSha}`,
    '',
    '## Current feature documentation',
    '',
    docs,
    '',
    '## Git diff for this push',
    '',
    input.diff.diff,
  ].join('\n');
}

/**
 * PASS 2 -- generate the QA test cases for this change.
 *
 * Gets the *updated* feature doc alongside the diff so cases can reference
 * documented behavior rather than just the changed lines. Malformed JSON or a
 * schema violation throws, so a bad response fails the job instead of writing
 * partial rows.
 */
export async function generateTestCases(input: TestCaseGenerationInput): Promise<TestCaseGenerationResult> {
  const client = getClient();
  const model = env.MINIMAX_MODEL;

  const params: MiniMaxChatParams = {
    model,
    max_tokens: MAX_TOKENS,
    messages: [
      { role: 'system', content: TEST_CASE_SYSTEM_PROMPT },
      { role: 'user', content: buildTestCaseUserMessage(input) },
    ],
    thinking: { type: 'disabled' },
  };

  logger.info({ repo: input.repoFullName, model, pass: 'test-cases' }, 'MiniMax call started');

  let response;
  try {
    response = await client.chat.completions.create(params);
  } catch (err) {
    logger.error({ repo: input.repoFullName, model, pass: 'test-cases', err }, 'MiniMax call failed');
    throw err;
  }

  logger.info(
    {
      repo: input.repoFullName,
      model,
      pass: 'test-cases',
      inputTokens: response.usage?.prompt_tokens,
      outputTokens: response.usage?.completion_tokens,
    },
    'MiniMax call succeeded',
  );

  const choice = response.choices[0];
  if (!choice) {
    throw new Error(`MiniMax returned no choices for test cases on ${input.repoFullName}.`);
  }
  if (choice.finish_reason === 'length') {
    throw new Error(
      `Test-case generation for ${input.repoFullName} hit the ${MAX_TOKENS}-token cap; the JSON is truncated.`,
    );
  }

  const raw = stripCodeFence(stripThinkBlock(choice.message.content ?? ''));
  if (!raw) {
    throw new Error(`MiniMax returned an empty test-case response for ${input.repoFullName}.`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      `MiniMax returned non-JSON test cases for ${input.repoFullName}: ${raw.slice(0, 300)}`,
    );
  }

  const validated = testCaseResponseSchema.safeParse(parsed);
  if (!validated.success) {
    const issues = validated.error.issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    throw new Error(`MiniMax test cases failed validation for ${input.repoFullName}: ${issues}`);
  }

  logger.info(
    { repo: input.repoFullName, model, count: validated.data.testCases.length },
    'test cases ready',
  );

  return { testCases: validated.data.testCases, model };
}
