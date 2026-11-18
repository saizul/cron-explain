import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { VERSION } from '../src/index.js';
import { cli } from './helpers.js';

describe('cli', () => {
  it('prints help and version', () => {
    const help = cli(['--help']);
    assert.equal(help.code, 0);
    assert.match(help.stdout, /Usage: cron-explain <expression>/);
    assert.match(help.stdout, /en, bn/);
    assert.equal(cli(['-v']).stdout, `${VERSION}\n`);
  });

  it('explains an expression and lists the next runs', () => {
    const r = cli([
      '*/15 9-17 * * 1-5',
      '--next',
      '3',
      '--tz',
      'Asia/Dhaka',
      '--from',
      '2026-11-18T00:00:00Z',
    ]);
    assert.equal(r.code, 0);
    assert.equal(
      r.stdout,
      [
        '*/15 9-17 * * 1-5',
        'Every 15 minutes, between 09:00 and 17:59, Monday through Friday',
        '',
        'Next 3 runs (Time zone: Asia/Dhaka):',
        '   1. 2026-11-18 09:00:00 +06:00  Wednesday',
        '   2. 2026-11-18 09:15:00 +06:00  Wednesday',
        '   3. 2026-11-18 09:30:00 +06:00  Wednesday',
        '',
      ].join('\n'),
    );
  });

  it('speaks Bangla with --locale bn', () => {
    const r = cli(['*/15 9-17 * * 1-5', '--next', '2', '--tz', 'Asia/Dhaka', '--locale', 'bn']);
    assert.equal(r.code, 0);
    assert.match(r.stdout, /সোমবার থেকে শুক্রবার, ০৯:০০ থেকে ১৭:৫৯-এর মধ্যে, প্রতি ১৫ মিনিট পরপর/);
    assert.match(r.stdout, /পরবর্তী ২টি রান \(টাইম জোন: Asia\/Dhaka\):/);
    assert.match(r.stdout, /১\. ২০২৬-১১-১৮ ০৯:০০:০০ \+০৬:০০ {2}বুধবার/);
  });

  it('defaults to 5 next runs and accepts --opt=value', () => {
    const r = cli(['@hourly', '--tz=UTC']);
    assert.equal(r.code, 0);
    assert.match(r.stdout, /Next 5 runs/);
    assert.match(r.stdout, / 5\. 2026-11-18 05:00:00 \+00:00/);
    assert.doesNotMatch(cli(['@hourly', '--tz=UTC', '-n', '0']).stdout, /Next/);
  });

  it('lists previous runs', () => {
    const r = cli(['0 9 * * *', '--tz', 'UTC', '-n', '0', '-p', '2']);
    assert.match(r.stdout, /Previous 2 runs/);
    assert.match(r.stdout, /1\. 2026-11-17 09:00:00/);
    assert.match(r.stdout, /2\. 2026-11-16 09:00:00/);
  });

  it('joins unquoted fields into one expression', () => {
    const r = cli(['0', '9', '*', '*', '1-5', '--tz', 'UTC', '-n', '1']);
    assert.equal(r.code, 0);
    assert.match(r.stdout, /At 09:00, Monday through Friday/);
  });

  it('shows warnings, and fails on them with --strict', () => {
    const r = cli(['0 0 1 * MON', '--tz', 'UTC', '-n', '1']);
    assert.equal(r.code, 0);
    assert.match(r.stdout, /Warnings:\n {2}! .*EITHER.*\[DOM_DOW_OR\]/);
    assert.equal(cli(['0 0 1 * MON', '--tz', 'UTC', '--strict']).code, 1);
    assert.equal(cli(['0 9 * * *', '--tz', 'UTC', '--strict']).code, 0);
  });

  it('reports invalid expressions with exit code 1', () => {
    const r = cli(['61 * * * *']);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /invalid expression "61 \* \* \* \*"/);
    assert.match(r.stderr, /minute: 61 is out of range \(0-59\) \[OUT_OF_RANGE\]/);
  });

  it('describes @reboot without run times', () => {
    const r = cli(['@reboot', '--tz', 'UTC']);
    assert.equal(r.code, 0);
    assert.match(r.stdout, /At system startup/);
    assert.match(r.stdout, /no clock times/);
  });

  it('says so when there are no runs', () => {
    assert.match(cli(['0 0 30 2 *', '--tz', 'UTC', '-n', '1']).stdout, /No run times found/);
  });

  it('prints JSON', () => {
    const r = cli(['0 9 * * MON-FRI', '--json', '--tz', 'Asia/Dhaka', '-n', '2', '-l', 'bn', '-p', '1']);
    assert.equal(r.code, 0);
    const out = JSON.parse(r.stdout);
    assert.equal(out.valid, true);
    assert.equal(out.normalized, '0 9 * * 1-5');
    assert.equal(out.description, 'সোমবার থেকে শুক্রবার, ০৯:০০-এ');
    assert.equal(out.locale, 'bn');
    assert.deepEqual(out.next, ['2026-11-18T09:00:00+06:00', '2026-11-19T09:00:00+06:00']);
    assert.deepEqual(out.previous, ['2026-11-17T09:00:00+06:00']);
    assert.deepEqual(out.warnings, []);
  });

  it('prints JSON errors', () => {
    const r = cli(['* * *', '--json']);
    assert.equal(r.code, 1);
    const out = JSON.parse(r.stdout);
    assert.equal(out.valid, false);
    assert.equal(out.errors[0].code, 'FIELD_COUNT');
  });

  it('honours --seconds', () => {
    assert.equal(cli(['0 0 9 * * *', '--seconds', 'forbidden']).code, 1);
    assert.equal(cli(['0 0 9 * * *', '--seconds', 'required', '--tz', 'UTC']).code, 0);
  });

  it('rejects usage errors with exit code 2', () => {
    const cases: [string[], RegExp][] = [
      [[], /missing cron expression/],
      [['* * * * *', '--next'], /--next needs a value/],
      [['* * * * *', '--next', 'many'], /whole number/],
      [['* * * * *', '--next', '5000'], /whole number/],
      [['* * * * *', '--bogus'], /unknown option "--bogus"/],
      [['* * * * *', '--tz', 'Mars/Olympus'], /unknown time zone "Mars\/Olympus"/],
      [['* * * * *', '--locale', 'xx'], /unknown locale "xx"/],
      [['* * * * *', '--from', 'soon'], /--from is not a valid date/],
      [['* * * * *', '--seconds', 'maybe'], /--seconds expects/],
    ];
    for (const [args, message] of cases) {
      const r = cli(args);
      assert.equal(r.code, 2, args.join(' '));
      assert.match(r.stderr, message);
    }
  });

  it('treats everything after -- as the expression', () => {
    const r = cli(['--tz', 'UTC', '-n', '1', '--', '@daily']);
    assert.equal(r.code, 0);
    assert.match(r.stdout, /At 00:00, every day/);
  });
});

describe('cli: output safety', () => {
  it('does not echo control characters from the input', () => {
    const r = cli([`\u001b[31m * * * *`]);
    assert.equal(r.code, 1);
    assert.doesNotMatch(r.stderr, /\u001b/);
    assert.match(r.stderr, /\?\[31m/);
  });
});
