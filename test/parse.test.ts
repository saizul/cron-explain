import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CronError, normalize, parse, validate } from '../src/index.js';

function errorOf(expr: string, options = {}): CronError {
  try {
    parse(expr, options);
  } catch (err) {
    assert.ok(err instanceof CronError, 'expected a CronError');
    return err;
  }
  assert.fail(`expected "${expr}" to be invalid`);
}

describe('parse: fields', () => {
  it('parses the five standard fields', () => {
    const e = parse('*/15 9-17 * * 1-5');
    assert.equal(e.hasSeconds, false);
    assert.deepEqual(e.second.values, [0]);
    assert.deepEqual(e.minute.values, [0, 15, 30, 45]);
    assert.deepEqual(e.hour.values, [9, 10, 11, 12, 13, 14, 15, 16, 17]);
    assert.equal(e.dayOfMonth.any, true);
    assert.equal(e.month.values.length, 12);
    assert.deepEqual(e.dayOfWeek.values, [1, 2, 3, 4, 5]);
    assert.equal(e.dayOfWeek.any, false);
  });

  it('accepts an optional leading seconds field', () => {
    const e = parse('*/20 0 12 * * *');
    assert.equal(e.hasSeconds, true);
    assert.deepEqual(e.second.values, [0, 20, 40]);
    assert.deepEqual(e.minute.values, [0]);
    assert.deepEqual(e.hour.values, [12]);
  });

  it('respects the seconds option', () => {
    assert.equal(errorOf('0 0 12 * * *', { seconds: 'forbidden' }).code, 'FIELD_COUNT');
    assert.equal(errorOf('0 12 * * *', { seconds: 'required' }).code, 'FIELD_COUNT');
    assert.equal(parse('0 0 12 * * *', { seconds: 'required' }).hasSeconds, true);
  });

  it('parses lists, ranges and steps', () => {
    assert.deepEqual(parse('1,5,10-12 * * * *').minute.values, [1, 5, 10, 11, 12]);
    assert.deepEqual(parse('10-30/10 * * * *').minute.values, [10, 20, 30]);
    assert.deepEqual(parse('50/5 * * * *').minute.values, [50, 55]);
    assert.deepEqual(parse('* */6 * * *').hour.values, [0, 6, 12, 18]);
    assert.deepEqual(parse('0 0 */10 * *').dayOfMonth.values, [1, 11, 21, 31]);
  });

  it('de-duplicates and sorts values', () => {
    assert.deepEqual(parse('30,0,30,15 * * * *').minute.values, [0, 15, 30]);
  });

  it('accepts month and weekday names in any case', () => {
    const e = parse('0 0 * jan-Mar,DEC mon-fri');
    assert.deepEqual(e.month.values, [1, 2, 3, 12]);
    assert.deepEqual(e.dayOfWeek.values, [1, 2, 3, 4, 5]);
  });

  it('treats day-of-week 7 as Sunday', () => {
    assert.deepEqual(parse('0 0 * * 7').dayOfWeek.values, [0]);
    assert.deepEqual(parse('0 0 * * 5-7').dayOfWeek.values, [0, 5, 6]);
    assert.deepEqual(parse('0 0 * * */2').dayOfWeek.values, [0, 2, 4, 6]);
  });

  it('treats ? like * in the day fields', () => {
    const e = parse('0 12 ? * MON');
    assert.equal(e.dayOfMonth.any, true);
    assert.deepEqual(e.dayOfWeek.values, [1]);
  });

  it('parses L, W and # in the day fields', () => {
    assert.deepEqual(parse('0 0 L * *').dayOfMonth.parts, [{ kind: 'lastDay' }]);
    assert.deepEqual(parse('0 0 LW * *').dayOfMonth.parts, [{ kind: 'lastWeekday' }]);
    assert.deepEqual(parse('0 0 15W * *').dayOfMonth.parts, [{ kind: 'nearestWeekday', day: 15 }]);
    assert.deepEqual(parse('0 0 * * 5L').dayOfWeek.parts, [{ kind: 'lastOfMonth', weekday: 5 }]);
    assert.deepEqual(parse('0 0 * * FRIL').dayOfWeek.parts, [{ kind: 'lastOfMonth', weekday: 5 }]);
    assert.deepEqual(parse('0 0 * * MON#2').dayOfWeek.parts, [{ kind: 'nth', weekday: 1, nth: 2 }]);
    assert.deepEqual(parse('0 0 * * 7#1').dayOfWeek.parts, [{ kind: 'nth', weekday: 0, nth: 1 }]);
  });

  it('tolerates surrounding and repeated whitespace', () => {
    assert.equal(parse('  0   9\t* *  1-5 ').source, '0   9\t* *  1-5');
  });
});

describe('parse: macros', () => {
  const cases: Record<string, string> = {
    '@yearly': '0 0 1 1 *',
    '@annually': '0 0 1 1 *',
    '@monthly': '0 0 1 * *',
    '@weekly': '0 0 * * 0',
    '@daily': '0 0 * * *',
    '@midnight': '0 0 * * *',
    '@hourly': '0 * * * *',
  };
  for (const [macro, expanded] of Object.entries(cases)) {
    it(`expands ${macro}`, () => {
      const e = parse(macro);
      assert.equal(e.macro, macro);
      assert.equal(normalize(e), expanded);
    });
  }

  it('is case-insensitive', () => {
    assert.equal(parse('@DAILY').macro, '@daily');
  });

  it('marks @reboot as having no schedule', () => {
    const e = parse('@reboot');
    assert.equal(e.reboot, true);
    assert.equal(normalize(e), '@reboot');
  });

  it('rejects unknown macros and @every', () => {
    assert.equal(errorOf('@fortnightly').code, 'UNKNOWN_MACRO');
    assert.match(errorOf('@fortnightly').message, /supported: @yearly/);
    assert.equal(errorOf('@every 5m').code, 'UNSUPPORTED');
  });
});

describe('parse: errors', () => {
  const cases: [string, string, RegExp][] = [
    ['', 'EMPTY', /empty/],
    ['   ', 'EMPTY', /empty/],
    ['* * * *', 'FIELD_COUNT', /4 field\(s\) given/],
    ['* * * * * * * *', 'FIELD_COUNT', /8 field/],
    ['0 0 12 * * * 2026', 'UNSUPPORTED', /year field/],
    ['60 * * * *', 'OUT_OF_RANGE', /minute: 60 is out of range \(0-59\)/],
    ['0 24 * * *', 'OUT_OF_RANGE', /hour: 24/],
    ['0 0 0 * *', 'OUT_OF_RANGE', /day-of-month: 0/],
    ['0 0 32 * *', 'OUT_OF_RANGE', /day-of-month: 32/],
    ['0 0 * 13 *', 'OUT_OF_RANGE', /month: 13/],
    ['0 0 * * 8', 'OUT_OF_RANGE', /day-of-week: 8/],
    ['5-1 * * * *', 'INVALID_RANGE', /goes backwards; split it, e.g. "5-59,0-1"/],
    ['1-2-3 * * * *', 'INVALID_RANGE', /not a valid range/],
    ['*/0 * * * *', 'INVALID_STEP', /step 0/],
    ['*/x * * * *', 'INVALID_STEP', /not a whole number/],
    ['*/5/2 * * * *', 'INVALID_STEP', /more than one/],
    ['1,,2 * * * *', 'INVALID_TOKEN', /empty list item/],
    ['a * * * *', 'UNKNOWN_NAME', /"a" is not a valid minute name/],
    ['0 0 * * MOX', 'UNKNOWN_NAME', /use SUN-SAT/],
    ['0 0 * FOO *', 'UNKNOWN_NAME', /use JAN-DEC/],
    ['0 0 * * JAN', 'UNKNOWN_NAME', /day-of-week name/],
    ['1.5 * * * *', 'INVALID_TOKEN', /not a number/],
    ['? * * * *', 'INVALID_TOKEN', /only allowed in day-of-month and day-of-week/],
    ['0 0 L-3 * *', 'UNSUPPORTED', /L-3.*not supported yet/],
    ['0 0 * * L', 'UNSUPPORTED', /ambiguous/],
    ['H * * * *', 'UNSUPPORTED', /Jenkins/],
    ['H(0-29) * * * *', 'UNSUPPORTED', /Jenkins/],
    ['5L * * * *', 'UNSUPPORTED', /only allowed in day-of-month and day-of-week/],
    ['0 0 * * 1#6', 'OUT_OF_RANGE', /must be 1-5/],
    ['0 0 * * 1#0', 'OUT_OF_RANGE', /must be 1-5/],
    ['0 0 32W * *', 'OUT_OF_RANGE', /32/],
  ];
  for (const [expr, code, message] of cases) {
    it(`rejects ${JSON.stringify(expr)} with ${code}`, () => {
      const err = errorOf(expr);
      assert.equal(err.code, code);
      assert.match(err.message, message);
    });
  }

  it('reports every invalid field at once', () => {
    const err = errorOf('99 99 * * *');
    assert.equal(err.issues.length, 2);
    assert.deepEqual(
      err.issues.map((i) => i.field),
      ['minute', 'hour'],
    );
    assert.match(err.message, /\(and 1 more\)$/);
    assert.equal(err.field, 'minute');
    assert.equal(err.token, '99');
  });

  it('validate() returns errors instead of throwing', () => {
    const r = validate('99 * * * *');
    assert.equal(r.valid, false);
    assert.equal(r.errors[0]?.code, 'OUT_OF_RANGE');
    assert.equal(r.expression, undefined);
    const ok = validate('0 9 * * 1-5');
    assert.equal(ok.valid, true);
    assert.deepEqual(ok.errors, []);
    assert.equal(ok.expression?.hour.values[0], 9);
  });

  it('validate() reports an unknown time zone as an error', () => {
    const r = validate('0 9 * * *', { tz: 'Mars/Olympus' });
    assert.equal(r.valid, false);
    assert.equal(r.errors[0]?.code, 'INVALID_TIMEZONE');
  });

  it('rejects non-string input', () => {
    assert.equal(errorOf(42 as unknown as string).code, 'INVALID_OPTION');
  });
});

describe('normalize', () => {
  const cases: [string, string][] = [
    ['0 9 * * MON-FRI', '0 9 * * 1-5'],
    ['*/15 9-17 ? JAN *', '*/15 9-17 * 1 *'],
    ['50/5 * * * *', '50-59/5 * * * *'],
    ['0 0 L,15W * 5L,1#2', '0 0 L,15W * 5L,1#2'],
    ['0 0 LW * SUN', '0 0 LW * 0'],
    ['30 */10 * * * *', '30 */10 * * * *'],
    ['@daily', '0 0 * * *'],
  ];
  for (const [input, output] of cases) {
    it(`${input} -> ${output}`, () => assert.equal(normalize(input), output));
  }
});
