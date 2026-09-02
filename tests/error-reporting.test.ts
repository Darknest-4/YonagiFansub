import { describe, expect, it } from 'vitest';
import { buildEnvelope, parseDsn } from '@/infrastructure/error-reporting';

/**
 * Error reporting.
 *
 * The reporter runs on the one code path where the system is already failing,
 * so its own failure modes matter more than its happy path: a DSN typo must
 * disable reporting rather than crash the process, and the payload must not
 * carry anything the logger took out.
 */

describe('parseDsn', () => {
  it('derives the envelope endpoint and key from a well-formed DSN', () => {
    expect(parseDsn('https://abc123@o42.ingest.sentry.io/7654321')).toEqual({
      envelopeUrl: 'https://o42.ingest.sentry.io/api/7654321/envelope/',
      publicKey: 'abc123',
    });
  });

  it('supports a self-hosted collector on a custom host and scheme', () => {
    expect(parseDsn('http://key@sentry.internal:9000/2')).toEqual({
      envelopeUrl: 'http://sentry.internal:9000/api/2/envelope/',
      publicKey: 'key',
    });
  });

  it('returns null rather than throwing for a malformed DSN', () => {
    // Each of these is a plausible typo, and none may take the process down.
    expect(parseDsn('')).toBeNull();
    expect(parseDsn('not-a-url')).toBeNull();
    expect(parseDsn('https://o42.ingest.sentry.io/7654321')).toBeNull(); // no key
    expect(parseDsn('https://abc123@o42.ingest.sentry.io')).toBeNull(); // no project
  });
});

describe('buildEnvelope', () => {
  const eventId = 'a'.repeat(32);
  const sentAt = '2026-08-27T20:00:00.000Z';

  function parseLines(envelope: string) {
    const [header, itemHeader, event] = envelope.split('\n');
    return {
      header: JSON.parse(header as string),
      itemHeader: JSON.parse(itemHeader as string),
      event: JSON.parse(event as string),
    };
  }

  it('produces the three newline-delimited objects the protocol expects', () => {
    const envelope = buildEnvelope({ message: 'Request failed' }, eventId, sentAt);
    expect(envelope.split('\n')).toHaveLength(3);

    const { header, itemHeader, event } = parseLines(envelope);
    expect(header).toEqual({ event_id: eventId, sent_at: sentAt });
    expect(itemHeader).toEqual({ type: 'event' });
    expect(event.event_id).toBe(eventId);
    expect(event.message.formatted).toBe('Request failed');
    expect(event.level).toBe('error');
  });

  it('carries the exception type, message and a reversed stack', () => {
    const error = new TypeError('nope');
    error.stack = [
      'TypeError: nope',
      '    at inner (/app/src/a.ts:10:5)',
      '    at outer (/app/src/b.ts:20:9)',
    ].join('\n');

    const { event } = parseLines(buildEnvelope({ message: 'boom', error }, eventId, sentAt));
    const [value] = event.exception.values;

    expect(value.type).toBe('TypeError');
    expect(value.value).toBe('nope');
    // Sentry wants oldest frame first, which is the reverse of a V8 stack.
    expect(value.stacktrace.frames.map((frame: { function: string }) => frame.function)).toEqual([
      'outer',
      'inner',
    ]);
    expect(value.stacktrace.frames[0]).toMatchObject({
      filename: '/app/src/b.ts',
      lineno: 20,
      colno: 9,
    });
  });

  it('omits the exception block for a non-Error value', () => {
    const { event } = parseLines(
      buildEnvelope({ message: 'boom', error: 'a string' }, eventId, sentAt),
    );
    expect(event.exception).toBeUndefined();
  });

  it('promotes the request id and route to tags', () => {
    const { event } = parseLines(
      buildEnvelope(
        { message: 'boom', context: { requestId: 'req-1', route: 'POST /api/v1/x' } },
        eventId,
        sentAt,
      ),
    );
    expect(event.tags).toEqual({ request_id: 'req-1', route: 'POST /api/v1/x' });
  });

  it('passes the context through verbatim — redaction happens upstream', () => {
    // The logger redacts before calling the reporter, so what arrives here as
    // `[REDACTED]` must still be `[REDACTED]` on the way out.
    const { event } = parseLines(
      buildEnvelope(
        { message: 'boom', context: { password: '[REDACTED]', userId: 'u1' } },
        eventId,
        sentAt,
      ),
    );
    expect(event.extra).toEqual({ password: '[REDACTED]', userId: 'u1' });
    expect(JSON.stringify(event)).not.toContain('hunter2');
  });

  it('survives a stack line it cannot parse', () => {
    const error = new Error('x');
    error.stack = 'Error: x\n    at <weird frame with no location>';
    const { event } = parseLines(buildEnvelope({ message: 'boom', error }, eventId, sentAt));
    expect(event.exception.values[0].stacktrace.frames).toHaveLength(1);
  });
});
