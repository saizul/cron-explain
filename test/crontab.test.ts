import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { run } from '../src/cli/run.js';
import { parseCrontab } from '../src/index.js';

const CRONTAB = [
  '# m h dom mon dow command',
  'SHELL=/bin/bash',
  'MAILTO="ops@example.com"',
  '',
  '*/15 * * * *  /usr/local/bin/sync --quiet',
  '0 2 * * *     /usr/local/bin/backup.sh > /var/log/backup.log 2>&1',
  'CRON_TZ=America/New_York',
  '30 8 * * 1-5  /usr/local/bin/report',
  '@reboot       /usr/local/bin/warm-cache',
  '61 * * * *    /bin/true',
  '0 0 1',
].join('\n');

function cliFile(args: string[], files: Record<string, string>) {
  let stdout = '';
  let stderr = '';
  const code = run(args, {
    stdout: (t) => {
      stdout += t;
    },
    stderr: (t) => {
      stderr += t;
    },
    now: () => Date.parse('2026-11-18T00:00:00Z'),
    readFile: (path) => {
      const text = files[path];
      if (text === undefined) throw new Error('no such file');
      return text;
    },
  });
  return { code, stdout, stderr };
}

describe('parseCrontab', () => {
  it('reads jobs, variables, CRON_TZ and problems', () => {
    const tab = parseCrontab(CRONTAB);
    assert.deepEqual(
      tab.jobs.map((j) => [j.line, j.expression, j.command, j.timeZone]),
      [
        [5, '*/15 * * * *', '/usr/local/bin/sync --quiet', undefined],
        [6, '0 2 * * *', '/usr/local/bin/backup.sh > /var/log/backup.log 2>&1', undefined],
        [8, '30 8 * * 1-5', '/usr/local/bin/report', 'America/New_York'],
        [9, '@reboot', '/usr/local/bin/warm-cache', 'America/New_York'],
        [10, '61 * * * *', '/bin/true', 'America/New_York'],
      ],
    );
    assert.deepEqual(
      tab.variables.map((v) => [v.name, v.value]),
      [
        ['SHELL', '/bin/bash'],
        ['MAILTO', 'ops@example.com'],
        ['CRON_TZ', 'America/New_York'],
      ],
    );
    assert.deepEqual(tab.problems, [{ line: 11, message: 'expected 5 time fields and a command' }]);
  });

  it('handles the system layout, CRLF, a BOM and a missing command', () => {
    const tab = parseCrontab('﻿17 * * * * root cd / && run-parts /etc/cron.hourly\r\n@daily root\r\n', {
      system: true,
    });
    assert.equal(tab.jobs.length, 1);
    assert.equal(tab.jobs[0]!.user, 'root');
    assert.equal(tab.jobs[0]!.command, 'cd / && run-parts /etc/cron.hourly');
    assert.deepEqual(tab.problems, [{ line: 2, message: 'missing command after the schedule' }]);
    assert.deepEqual(parseCrontab('0 * * * *\n').problems, [
      { line: 1, message: 'missing command after the schedule' },
    ]);
  });

  it('clears CRON_TZ with an empty value', () => {
    const tab = parseCrontab('CRON_TZ=UTC\n0 1 * * * a\nCRON_TZ=\n0 2 * * * b\n');
    assert.deepEqual(
      tab.jobs.map((j) => j.timeZone),
      ['UTC', undefined],
    );
  });
});

describe('cli --file', () => {
  it('explains every job with its next run', () => {
    const r = cliFile(['--file', 'crontab', '--tz', 'UTC'], { crontab: CRONTAB });
    assert.equal(r.code, 1);
    assert.equal(
      r.stdout,
      [
        'line 5: */15 * * * *  /usr/local/bin/sync --quiet',
        '  Every 15 minutes',
        '  → 2026-11-18 00:15:00 +00:00  Wednesday',
        '',
        'line 6: 0 2 * * *  /usr/local/bin/backup.sh > /var/log/backup.log 2>&1',
        '  At 02:00, every day',
        '  → 2026-11-18 02:00:00 +00:00  Wednesday',
        '',
        'line 8: 30 8 * * 1-5  /usr/local/bin/report',
        '  At 08:30, Monday through Friday',
        '  Time zone: America/New_York',
        '  → 2026-11-18 08:30:00 -05:00  Wednesday',
        '',
        'line 9: @reboot  /usr/local/bin/warm-cache',
        '  At system startup',
        '  Time zone: America/New_York',
        '',
        'line 10: 61 * * * *  /bin/true',
        '  \u2716 minute: 61 is out of range (0-59) [OUT_OF_RANGE]',
        '',
        'line 11: expected 5 time fields and a command',
        '',
        '5 job(s): 4 valid, 2 invalid, 0 with warnings (time zone: UTC)',
        '',
      ].join('\n'),
    );
  });

  it('exits 0 for a clean file and honours --next, --strict and --json', () => {
    const files = { ok: '0 9 * * 1 /bin/weekly\n0 0 31 2 * /bin/never\n', clean: '0 9 * * 1 /bin/weekly\n' };
    assert.equal(cliFile(['--file', 'clean', '--tz', 'UTC'], files).code, 0);
    const three = cliFile(['--file', 'clean', '--tz', 'UTC', '--next', '3'], files);
    assert.equal((three.stdout.match(/→/g) ?? []).length, 3);
    assert.equal(cliFile(['--file', 'ok', '--tz', 'UTC', '--strict'], files).code, 1);
    const json = cliFile(['--file', 'ok', '--tz', 'UTC', '--json'], files);
    const data = JSON.parse(json.stdout);
    assert.equal(data.file, 'ok');
    assert.equal(data.jobs.length, 2);
    assert.deepEqual(data.jobs[0].next, ['2026-11-23T09:00:00+00:00']);
    assert.equal(data.jobs[0].description, 'At 09:00, on Monday');
    assert.ok(data.jobs[1].warnings.length > 0);
  });

  it('reads system crontabs and reports bad CRON_TZ values', () => {
    const files = { sys: 'CRON_TZ=Mars/Olympus\n5 4 * * * root /usr/bin/x\n' };
    const r = cliFile(['--file', 'sys', '--system', '--tz', 'UTC', '--json'], files);
    const data = JSON.parse(r.stdout);
    assert.equal(r.code, 1);
    assert.equal(data.jobs[0].user, 'root');
    assert.equal(data.jobs[0].errors[0].code, 'INVALID_TIME_ZONE');
  });

  it('rejects bad usage', () => {
    assert.equal(cliFile(['--file', 'x', '0 * * * *'], { x: '' }).code, 2);
    assert.equal(cliFile(['--system', '0 * * * *'], {}).code, 2);
    const missing = cliFile(['--file', 'nope'], {});
    assert.equal(missing.code, 2);
    assert.match(missing.stderr, /cannot read nope: no such file/);
    assert.match(
      cliFile(['--file', 'empty', '--tz', 'UTC'], { empty: '# nothing\n' }).stdout,
      /no jobs found/,
    );
  });
});
