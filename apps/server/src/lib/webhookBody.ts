import { parse as parseQueryString } from 'node:querystring';

/**
 * GitHub's webhook form offers two content types and defaults to
 * `application/x-www-form-urlencoded`, which sends the event as a single
 * urlencoded form field:
 *
 *   payload=%7B%22ref%22%3A%22refs%2Fheads%2Fmain%22...%7D
 *
 * rather than as a bare JSON body. Both encodings are legitimate, so we accept
 * either instead of rejecting a hook that was left on the default setting.
 *
 * The HMAC is unaffected: GitHub signs the raw bytes it transmits, so
 * verification still runs against the untouched buffer. This module only
 * decides how to read the JSON *out* of those bytes.
 */

export type WebhookBody =
  | { ok: true; payload: unknown; encoding: 'json' | 'form' }
  | { ok: false; reason: string };

function tryJson(text: string): unknown | undefined {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Pulls the `payload` field out of a urlencoded form body and parses it. */
function tryForm(text: string): unknown | undefined {
  const field = parseQueryString(text).payload;
  const raw = Array.isArray(field) ? field[0] : field;
  return raw ? tryJson(raw) : undefined;
}

/**
 * Reads the event JSON out of the raw body, tolerating either content type --
 * and tolerating a mislabelled one, by falling back to the other strategy.
 */
export function readWebhookBody(rawBody: Buffer, contentType: string | undefined): WebhookBody {
  if (rawBody.length === 0) {
    return { ok: false, reason: 'request body was empty' };
  }

  const mediaType = (contentType ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
  const text = rawBody.toString('utf8');
  const isForm = mediaType === 'application/x-www-form-urlencoded';

  // Try the encoding the header claims first, then the other one, so a hook
  // whose content type doesn't match its body still works.
  const first = isForm ? tryForm(text) : tryJson(text);
  if (first !== undefined) return { ok: true, payload: first, encoding: isForm ? 'form' : 'json' };

  const second = isForm ? tryJson(text) : tryForm(text);
  if (second !== undefined) return { ok: true, payload: second, encoding: isForm ? 'json' : 'form' };

  return {
    ok: false,
    reason: isForm
      ? "form-encoded body had no parsable 'payload' field"
      : `body was not valid JSON (content-type: ${mediaType || 'none'})`,
  };
}
