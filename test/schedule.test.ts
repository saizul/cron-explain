import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CronError,
  formatInTimeZone,
  isMatch,
  nextRun,
  nextRuns,
  parse,
  previousRun,
  previousRuns,
} from '../src/index.js';

const NY = 'America/New_York';

function next(expr: string, tz: string, from: string, count = 5): string[] {
  return nextRuns(expr, { tz, from, count }).map((d) => formatInTimeZone(d, tz));
}

function prev(expr: string, tz: string, from: string, count = 5): string[] {
  return previousRuns(expr, { tz, from, count }).map((d) => formatInTimeZone(d, tz));
}

describe('nextRuns', () => {
  it('lists weekday office-hour runs in Asia/Dhaka', () => {
    assert.deepEqual(next('*/15 9-17 * * 1-5', 'Asia/Dhaka', '2026-11-20T17:40:00+06:00', 4), [
      '2026-11-20T17:45:00+06:00',
      '2026-11-23T09:00:00+06:00',
      '2026-11-23T09:15:00+06:00',
      '2026-11-23T09:30:00+06:00',
    ]);
  });

  it('runs strictly after "from"', () => {
    assert.deepEqual(next('0 9 * * *', 'UTC', '2026-01-01T09:00:00Z', 2), [
      '2026-01-02T09:00:00+00:00',
      '2026-01-03T09:00:00+00:00',
    ]);
    assert.deepEqual(next('0 9 * * *', 'UTC', '2026-01-01T08:59:59.999Z', 1), ['2026-01-01T09:00:00+00:00']);
  });

  it('defaults to 5 runs', () => {
    assert.equal(nextRuns('@hourly', { tz: 'UTC', from: 0 }).length, 5);
  });

  it('accepts Date, number and string for "from"', () => {
    const want = '2026-01-01T01:00:00.000Z';
    const at = Date.UTC(2026, 0, 1, 0, 30);
    assert.equal(nextRun('@hourly', { tz: 'UTC', from: at })?.toISOString(), want);
    assert.equal(nextRun('@hourly', { tz: 'UTC', from: new Date(at) })?.toISOString(), want);
    assert.equal(nextRun('@hourly', { tz: 'UTC', from: '2026-01-01T00:30:00Z' })?.toISOString(), want);
  });

  it('handles seconds', () => {
    assert.deepEqual(next('*/20 * * * * *', 'UTC', '2026-01-01T00:00:00Z', 4), [
      '2026-01-01T00:00:20+00:00',
      '2026-01-01T00:00:40+00:00',
      '2026-01-01T00:01:00+00:00',
      '2026-01-01T00:01:20+00:00',
    ]);
  });

  it('crosses month and year boundaries', () => {
    assert.deepEqual(next('0 0 1 * *', 'UTC', '2026-11-15T00:00:00Z', 3), [
      '2026-12-01T00:00:00+00:00',
      '2027-01-01T00:00:00+00:00',
      '2027-02-01T00:00:00+00:00',
    ]);
  });

  it('finds Feb 29 in leap years only', () => {
    assert.deepEqual(next('0 0 29 2 *', 'UTC', '2026-01-01T00:00:00Z', 2), [
      '2028-02-29T00:00:00+00:00',
      '2032-02-29T00:00:00+00:00',
    ]);
  });

  it('returns no runs for impossible dates', () => {
    assert.deepEqual(nextRuns('0 0 30 2 *', { tz: 'UTC', from: 0 }), []);
    assert.equal(nextRun('0 0 31 4 *', { tz: 'UTC', from: 0 }), null);
  });

  it('uses OR when both day fields are restricted', () => {
    // 2026-06-01 is a Monday; then every Friday, plus the 1st of July.
    assert.deepEqual(next('0 0 1 * 5', 'UTC', '2026-05-31T00:00:00Z', 6), [
      '2026-06-01T00:00:00+00:00',
      '2026-06-05T00:00:00+00:00',
      '2026-06-12T00:00:00+00:00',
      '2026-06-19T00:00:00+00:00',
      '2026-06-26T00:00:00+00:00',
      '2026-07-01T00:00:00+00:00',
    ]);
  });

  it('uses AND when only one day field is restricted', () => {
    assert.deepEqual(next('0 0 * * 5', 'UTC', '2026-05-31T00:00:00Z', 2), [
      '2026-06-05T00:00:00+00:00',
      '2026-06-12T00:00:00+00:00',
    ]);
  });

  it('supports L, LW, W, nL and #', () => {
    assert.deepEqual(next('0 0 L * *', 'UTC', '2026-01-15T00:00:00Z', 3), [
      '2026-01-31T00:00:00+00:00',
      '2026-02-28T00:00:00+00:00',
      '2026-03-31T00:00:00+00:00',
    ]);
    // 2026-01-31 is a Saturday, 2026-05-31 a Sunday.
    assert.deepEqual(next('0 0 LW * *', 'UTC', '2026-01-01T00:00:00Z', 1), ['2026-01-30T00:00:00+00:00']);
    assert.deepEqual(next('0 0 LW * *', 'UTC', '2026-05-01T00:00:00Z', 1), ['2026-05-29T00:00:00+00:00']);
    // 2026-02-15 is a Sunday -> Monday 16th; 2026-08-15 is a Saturday -> Friday 14th.
    assert.deepEqual(next('0 0 15W * *', 'UTC', '2026-02-01T00:00:00Z', 1), ['2026-02-16T00:00:00+00:00']);
    assert.deepEqual(next('0 0 15W * *', 'UTC', '2026-08-01T00:00:00Z', 1), ['2026-08-14T00:00:00+00:00']);
    // 1W on a Saturday moves forward to Monday the 3rd (2026-08-01 is a Saturday).
    assert.deepEqual(next('0 0 1W * *', 'UTC', '2026-07-31T00:00:00Z', 1), ['2026-08-03T00:00:00+00:00']);
    assert.deepEqual(next('0 18 * * 5L', 'UTC', '2026-01-01T00:00:00Z', 2), [
      '2026-01-30T18:00:00+00:00',
      '2026-02-27T18:00:00+00:00',
    ]);
    assert.deepEqual(next('0 10 * * MON#1', 'UTC', '2026-01-01T00:00:00Z', 2), [
      '2026-01-05T10:00:00+00:00',
      '2026-02-02T10:00:00+00:00',
    ]);
    // A fifth Friday exists only in some months.
    assert.deepEqual(next('0 0 * * 5#5', 'UTC', '2026-01-01T00:00:00Z', 2), [
      '2026-01-30T00:00:00+00:00',
      '2026-05-29T00:00:00+00:00',
    ]);
  });

  it('treats 0 and 7 as Sunday', () => {
    assert.deepEqual(next('0 0 * * 7', 'UTC', '2026-01-01T00:00:00Z', 1), ['2026-01-04T00:00:00+00:00']);
    assert.deepEqual(next('0 0 * * 0', 'UTC', '2026-01-01T00:00:00Z', 1), ['2026-01-04T00:00:00+00:00']);
  });

  it('honours non-hour offsets', () => {
    assert.deepEqual(next('0 9 * * *', 'Asia/Kathmandu', '2026-01-01T00:00:00Z', 1), [
      '2026-01-01T09:00:00+05:45',
    ]);
  });

  it('returns an empty list for count 0', () => {
    assert.deepEqual(nextRuns('* * * * *', { count: 0 }), []);
  });

  it('is fast for every-second expressions', () => {
    const started = Date.now();
    assert.equal(
      nextRuns('* * * * * *', { tz: NY, count: 1000, from: '2026-03-08T01:00:00-05:00' }).length,
      1000,
    );
    assert.ok(Date.now() - started < 2000);
  });
});

describe('nextRuns: daylight saving time (America/New_York)', () => {
  // 2026-03-08: 02:00 EST jumps to 03:00 EDT. 2026-11-01: 02:00 EDT falls back to 01:00 EST.

  it('runs a job in the skipped hour right after the gap', () => {
    assert.deepEqual(next('30 2 * * *', NY, '2026-03-07T00:00:00-05:00', 3), [
      '2026-03-07T02:30:00-05:00',
      '2026-03-08T03:30:00-04:00',
      '2026-03-09T02:30:00-04:00',
    ]);
  });

  it('does not repeat or reorder runs around the gap', () => {
    assert.deepEqual(next('*/30 * * * *', NY, '2026-03-08T00:50:00-05:00', 5), [
      '2026-03-08T01:00:00-05:00',
      '2026-03-08T01:30:00-05:00',
      '2026-03-08T03:00:00-04:00',
      '2026-03-08T03:30:00-04:00',
      '2026-03-08T04:00:00-04:00',
    ]);
  });

  it('runs a fixed-hour job once in the repeated hour', () => {
    assert.deepEqual(next('30 1 * * *', NY, '2026-10-31T12:00:00-04:00', 2), [
      '2026-11-01T01:30:00-04:00',
      '2026-11-02T01:30:00-05:00',
    ]);
  });

  it('runs an every-hour job in both copies of the repeated hour', () => {
    assert.deepEqual(next('*/30 * * * *', NY, '2026-11-01T00:40:00-04:00', 6), [
      '2026-11-01T01:00:00-04:00',
      '2026-11-01T01:30:00-04:00',
      '2026-11-01T01:00:00-05:00',
      '2026-11-01T01:30:00-05:00',
      '2026-11-01T02:00:00-05:00',
      '2026-11-01T02:30:00-05:00',
    ]);
  });

  it('keeps wall-clock time across the change', () => {
    assert.deepEqual(next('0 9 * * *', NY, '2026-03-07T12:00:00-05:00', 2), [
      '2026-03-08T09:00:00-04:00',
      '2026-03-09T09:00:00-04:00',
    ]);
    const [a, b] = nextRuns('0 9 * * *', { tz: NY, from: '2026-03-07T12:00:00-05:00', count: 2 });
    assert.equal(b!.getTime() - a!.getTime(), 24 * 3_600_000);
  });

  it('handles every-second jobs across the gap', () => {
    assert.deepEqual(next('* * * * * *', NY, '2026-03-08T01:59:58-05:00', 3), [
      '2026-03-08T01:59:59-05:00',
      '2026-03-08T03:00:00-04:00',
      '2026-03-08T03:00:01-04:00',
    ]);
  });

  it('works for Europe/London too', () => {
    // 2026-03-29: 01:00 GMT jumps to 02:00 BST.
    assert.deepEqual(next('30 1 * * *', 'Europe/London', '2026-03-28T12:00:00Z', 2), [
      '2026-03-29T02:30:00+01:00',
      '2026-03-30T01:30:00+01:00',
    ]);
  });
});

describe('previousRuns', () => {
  it('lists runs before "from", newest first', () => {
    assert.deepEqual(prev('0 9 * * 1-5', 'UTC', '2026-11-18T08:00:00Z', 3), [
      '2026-11-17T09:00:00+00:00',
      '2026-11-16T09:00:00+00:00',
      '2026-11-13T09:00:00+00:00',
    ]);
  });

  it('walks backwards through the repeated hour', () => {
    assert.deepEqual(prev('*/30 * * * *', NY, '2026-11-01T02:10:00-05:00', 5), [
      '2026-11-01T02:00:00-05:00',
      '2026-11-01T01:30:00-05:00',
      '2026-11-01T01:00:00-05:00',
      '2026-11-01T01:30:00-04:00',
      '2026-11-01T01:00:00-04:00',
    ]);
  });

  it('previousRun returns one date or null', () => {
    assert.equal(
      previousRun('0 0 1 1 *', { tz: 'UTC', from: '2026-06-01T00:00:00Z' })?.toISOString(),
      '2026-01-01T00:00:00.000Z',
    );
    assert.equal(previousRun('0 0 30 2 *', { tz: 'UTC', from: 0 }), null);
  });
});

describe('isMatch', () => {
  it('checks a date in a time zone', () => {
    assert.equal(isMatch('*/15 9-17 * * 1-5', '2026-11-18T09:15:00+06:00', { tz: 'Asia/Dhaka' }), true);
    assert.equal(isMatch('*/15 9-17 * * 1-5', '2026-11-18T09:15:00+06:00', { tz: 'UTC' }), false);
    assert.equal(isMatch('*/15 9-17 * * 1-5', '2026-11-21T09:15:00+06:00', { tz: 'Asia/Dhaka' }), false);
    assert.equal(isMatch('0 9 * * *', '2026-11-18T09:00:30Z', { tz: 'UTC' }), false);
    assert.equal(isMatch(parse('30 0 9 * * *'), new Date('2026-11-18T09:00:30Z'), { tz: 'UTC' }), true);
    assert.equal(isMatch('@reboot', new Date(), { tz: 'UTC' }), false);
  });
});

describe('schedule errors', () => {
  const isCode = (code: string) => (err: unknown) => err instanceof CronError && err.code === code;

  it('rejects unknown time zones', () => {
    assert.throws(() => nextRuns('* * * * *', { tz: 'Mars/Olympus' }), isCode('INVALID_TIMEZONE'));
    assert.throws(() => isMatch('* * * * *', 0, { tz: 'Nope' }), isCode('INVALID_TIMEZONE'));
  });

  it('rejects bad counts and dates', () => {
    assert.throws(() => nextRuns('* * * * *', { count: -1 }), isCode('INVALID_OPTION'));
    assert.throws(() => nextRuns('* * * * *', { count: 1.5 }), isCode('INVALID_OPTION'));
    assert.throws(() => nextRuns('* * * * *', { from: 'yesterday' }), isCode('INVALID_OPTION'));
  });

  it('has no schedule for @reboot', () => {
    assert.throws(() => nextRuns('@reboot'), isCode('NO_SCHEDULE'));
  });

  it('throws parse errors for invalid expressions', () => {
    assert.throws(() => nextRuns('61 * * * *'), isCode('OUT_OF_RANGE'));
  });
});

describe('formatInTimeZone', () => {
  it('formats with the offset of the zone', () => {
    const d = new Date('2026-07-01T12:00:00Z');
    assert.equal(formatInTimeZone(d, 'Asia/Dhaka'), '2026-07-01T18:00:00+06:00');
    assert.equal(formatInTimeZone(d, NY), '2026-07-01T08:00:00-04:00');
    assert.equal(formatInTimeZone(d.getTime(), 'UTC'), '2026-07-01T12:00:00+00:00');
    assert.equal(formatInTimeZone(Date.UTC(2026, 0, 1), 'Asia/Kolkata'), '2026-01-01T05:30:00+05:30');
  });
});
