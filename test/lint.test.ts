import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { lint, validate } from '../src/index.js';

const codes = (expr: string, tz?: string) => lint(expr, tz ? { tz } : {}).map((w) => w.code);

describe('lint', () => {
  it('has nothing to say about ordinary expressions', () => {
    for (const expr of ['*/15 9-17 * * 1-5', '0 9 * * *', '@daily', '@reboot', '0 0 1 * *', '*/5 * * * *']) {
      assert.deepEqual(codes(expr), [], expr);
    }
  });

  it('warns about every minute and every second', () => {
    assert.deepEqual(codes('* * * * *'), ['EVERY_MINUTE']);
    assert.deepEqual(codes('0 * * * * *'), ['EVERY_MINUTE']);
    assert.deepEqual(codes('* * * * * *'), ['EVERY_SECOND']);
    assert.match(lint('* * * * *')[0]!.message, /1,440 times a day/);
  });

  it('does not warn about every minute when the days are restricted', () => {
    assert.deepEqual(codes('* * * * 1'), []);
  });

  it('warns about * in the minute field with a fixed hour', () => {
    const [w] = lint('* 9 * * *');
    assert.equal(w?.code, 'EVERY_MINUTE_IN_HOUR');
    assert.match(w!.message, /60 times a day/);
    assert.match(w!.message, /use 0 instead of \*/);
    assert.match(lint('* 9-10 * * *')[0]!.message, /120 times a day/);
  });

  it('explains the day-of-month OR day-of-week rule', () => {
    const [w] = lint('0 0 1 * MON');
    assert.equal(w?.code, 'DOM_DOW_OR');
    assert.equal(w?.severity, 'warning');
    assert.match(w!.message, /EITHER/);
    assert.deepEqual(codes('0 0 ? * MON'), []);
  });

  it('warns about step overflow', () => {
    const [w] = lint('*/60 * * * *');
    assert.equal(w?.code, 'STEP_OVERFLOW');
    assert.match(w!.message, /only matches 0/);
    assert.match(w!.message, /every 60 minutes/);
    assert.deepEqual(codes('0 */24 * * *'), ['STEP_OVERFLOW']);
    assert.deepEqual(codes('0 0 * * */7'), ['STEP_OVERFLOW']);
    assert.deepEqual(codes('10-15/10 * * * *'), ['STEP_OVERFLOW']);
    assert.deepEqual(codes('*/90 * * * * *'), ['EVERY_MINUTE', 'STEP_OVERFLOW']);
  });

  it('notes steps that do not divide the range evenly', () => {
    const [w] = lint('*/7 * * * *');
    assert.equal(w?.code, 'UNEVEN_STEP');
    assert.equal(w?.severity, 'info');
    assert.match(w!.message, /gap across each hour is 4 minutes, not 7/);
    assert.deepEqual(codes('0 */5 * * *'), ['UNEVEN_STEP']);
    assert.deepEqual(codes('*/15 * * * *'), []);
    assert.deepEqual(codes('0 */6 * * *'), []);
  });

  it('finds expressions that never run', () => {
    assert.deepEqual(codes('0 0 30 2 *'), ['NEVER_RUNS']);
    assert.deepEqual(codes('0 0 31 4,6,9,11 *'), ['NEVER_RUNS']);
    assert.deepEqual(codes('0 0 31W 2 *'), ['NEVER_RUNS']);
    // With a weekday as well, the OR rule makes it run on Mondays.
    assert.deepEqual(codes('0 0 30 2 1'), ['DOM_DOW_OR']);
  });

  it('notes days that some months skip', () => {
    const [w] = lint('0 0 31 * *');
    assert.equal(w?.code, 'SKIPS_SHORT_MONTHS');
    assert.match(w!.message, /February, April, June, September, November/);
    assert.match(w!.message, /Use L/);
    assert.match(lint('0 0 29 * *')[0]!.message, /February \(except in leap years\)/);
    assert.deepEqual(codes('0 0 29 2 *'), ['SKIPS_SHORT_MONTHS']);
    assert.deepEqual(codes('0 0 28 * *'), []);
    assert.deepEqual(codes('0 0 L * *'), []);
  });

  it('warns about daylight-saving hours only for zones and hours that need it', () => {
    assert.deepEqual(codes('30 2 * * *', 'America/New_York'), ['DST_SENSITIVE']);
    assert.match(lint('30 2 * * *', { tz: 'America/New_York' })[0]!.message, /02:00-02:59/);
    assert.deepEqual(codes('30 1 * * *', 'Europe/London'), ['DST_SENSITIVE']);
    assert.deepEqual(codes('0 0 * * *', 'America/New_York'), []);
    assert.deepEqual(codes('30 2 * * *', 'Asia/Dhaka'), []);
    assert.deepEqual(codes('30 2 * * *', 'UTC'), []);
    assert.deepEqual(codes('30 2 * * *'), []);
  });

  it('validate() returns warnings for valid expressions', () => {
    const r = validate('0 0 1 * 1');
    assert.equal(r.valid, true);
    assert.deepEqual(
      r.warnings.map((w) => w.code),
      ['DOM_DOW_OR'],
    );
  });
});
