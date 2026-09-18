/*
 * Pass 1 (updateFeatureDoc) calls MiniMax-M3 for real, through MiniMax's
 * OpenAI-compatible /v1/chat/completions endpoint -- hence the `openai`
 * package pointed at a different baseURL rather than any custom HTTP or auth.
 * Pass 2 (generateTestCases) is still a stub -- see the banner above it.
 */

import OpenAI from 'openai';
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

  const response = await client.chat.completions.create(params);

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
    'feature doc generated',
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

/*
 * ===========================================================================
 * STUB -- NOT IMPLEMENTED IN THIS PASS
 * ===========================================================================
 *
 * generateTestCases is still a deliberate placeholder. It returns well-formed
 * data of the right shape so the pipeline runs end to end, but makes no Claude
 * call and no prompt engineering has been done for it yet.
 *
 * To implement: mirror updateFeatureDoc above, but ask for structured JSON
 * matching GeneratedTestCase[] (a tool call is the reliable way) and validate
 * it with zod before it reaches Mongo.
 * ===========================================================================
 */

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
    model: 'stub:not-implemented',
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
