# cron-explain

[![CI](https://github.com/saizul/cron-explain/actions/workflows/ci.yml/badge.svg)](https://github.com/saizul/cron-explain/actions/workflows/ci.yml)
![Node 20+](https://img.shields.io/badge/node-20%2B-blue)
![Zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)
![TypeScript](https://img.shields.io/badge/types-included-blue)
![Locales: en, bn](https://img.shields.io/badge/locales-en%20%7C%20bn-orange)
![License: MIT](https://img.shields.io/badge/license-MIT-green)

Understand a cron expression before it runs at 3 a.m.

- **Parse and validate** 5-field and 6-field (seconds) expressions, macros
  like `@daily`, lists, ranges, steps, `MON`/`JAN` names and the `L`, `W`
  and `#` extensions, with clear errors that point at the broken field.
- **Explain** them in plain English and Bangla (বাংলা), with a small locale
  interface so more languages are easy to add.
- **List the next and previous run times** in any IANA time zone, with
  correct daylight-saving behaviour, using only `Intl`.
- **Catch common mistakes**: the day-of-month OR day-of-week trap, `*` in the
  minute field, steps that overflow, days that do not exist, and runs that a
  DST change can move.

A library and a CLI. Zero runtime dependencies. ESM, CommonJS and type
declarations included.

```console
$ cron-explain "*/15 9-17 * * 1-5" --next 5 --tz Asia/Dhaka --locale bn
*/15 9-17 * * 1-5
সোমবার থেকে শুক্রবার, ০৯:০০ থেকে ১৭:৫৯-এর মধ্যে, প্রতি ১৫ মিনিট পরপর

পরবর্তী ৫টি রান (টাইম জোন: Asia/Dhaka):
   ১. ২০২৬-১১-১৮ ০৯:০০:০০ +০৬:০০  বুধবার
   ২. ২০২৬-১১-১৮ ০৯:১৫:০০ +০৬:০০  বুধবার
   ৩. ২০২৬-১১-১৮ ০৯:৩০:০০ +০৬:০০  বুধবার
   ৪. ২০২৬-১১-১৮ ০৯:৪৫:০০ +০৬:০০  বুধবার
   ৫. ২০২৬-১১-১৮ ১০:০০:০০ +০৬:০০  বুধবার
```

## Contents

- [Install](#install)
- [Quick start](#quick-start)
- [CLI](#cli)
- [Supported syntax](#supported-syntax)
- [Examples](#examples)
- [Warnings](#warnings)
- [Time zones and daylight saving time](#time-zones-and-daylight-saving-time)
- [API reference](#api-reference)
- [Errors](#errors)
- [FAQ](#faq)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

## Install

The package is published to GitHub Packages as `@saizul/cron-explain`. Tell
npm where the `@saizul` scope lives (once per project or in `~/.npmrc`):

```console
$ echo "@saizul:registry=https://npm.pkg.github.com" >> .npmrc
$ npm install @saizul/cron-explain
```

GitHub Packages needs a token with `read:packages` even for public packages;
see [Authenticating to GitHub Packages](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry#authenticating-to-github-packages).

Node 20 or newer. Any runtime with full `Intl` time zone data works for the
library (browsers, Deno, Bun, edge runtimes).

## Quick start

### Library

```ts
import { explain, lint, nextRuns, formatInTimeZone } from '@saizul/cron-explain';

explain('*/15 9-17 * * 1-5');
// 'Every 15 minutes, between 09:00 and 17:59, Monday through Friday'

explain('*/15 9-17 * * 1-5', { locale: 'bn' });
// 'সোমবার থেকে শুক্রবার, ০৯:০০ থেকে ১৭:৫৯-এর মধ্যে, প্রতি ১৫ মিনিট পরপর'

const runs = nextRuns('0 9 * * 1-5', { count: 3, tz: 'Asia/Dhaka' });
runs.map((d) => formatInTimeZone(d, 'Asia/Dhaka'));
// [ '2026-11-18T09:00:00+06:00', '2026-11-19T09:00:00+06:00', '2026-11-20T09:00:00+06:00' ]

lint('0 0 1 * MON').map((w) => w.code);
// [ 'DOM_DOW_OR' ]
```

CommonJS works the same way:

```js
const { explain } = require('@saizul/cron-explain');
```

### CLI

```console
$ npx @saizul/cron-explain "30 2 * * *" --tz America/New_York --from 2026-03-07 --next 3
30 2 * * *
At 02:30, every day

Next 3 runs (Time zone: America/New_York):
   1. 2026-03-07 02:30:00 -05:00  Saturday
   2. 2026-03-08 03:30:00 -04:00  Sunday
   3. 2026-03-09 02:30:00 -04:00  Monday

Warnings:
  i in America/New_York, daylight-saving changes skip or repeat local time 02:00-02:59 on one or two days a year. A run in a skipped hour happens right after the gap; a run in a repeated hour happens once. [DST_SENSITIVE]
```

## CLI

```text
Usage: cron-explain <expression> [options]

Options:
  -n, --next <N>       show the next N run times (default 5; 0 to hide)
  -p, --prev <N>       show the previous N run times
  -z, --tz <zone>      IANA time zone, e.g. Asia/Dhaka (default: system zone)
  -l, --locale <code>  language of the description: en, bn (default en)
  -f, --from <date>    count runs from this ISO date instead of now
      --seconds <mode> optional (default), required or forbidden
      --json           print JSON instead of text
      --strict         exit with code 1 when there are warnings
  -h, --help           show this help
  -v, --version        show the version
```

Quote the expression so the shell does not expand `*`. Unquoted fields are
joined, so `cron-explain 0 9 '*' '*' 1-5` also works. Options accept
`--tz=UTC` as well as `--tz UTC`.

| Exit code | Meaning |
| --- | --- |
| 0 | The expression is valid (warnings are printed but do not fail) |
| 1 | The expression is invalid, or there are warnings and `--strict` is set |
| 2 | Usage error: unknown option, bad time zone, locale or date |

`--json` prints a machine-readable result, handy in scripts and CI:

```console
$ cron-explain "0 0 1 * MON" --json --next 2 --tz UTC
{
  "expression": "0 0 1 * MON",
  "valid": true,
  "normalized": "0 0 1 * 1",
  "description": "At 00:00, on day 1 of the month or on Monday",
  "locale": "en",
  "timeZone": "UTC",
  "next": [
    "2026-11-23T00:00:00+00:00",
    "2026-11-30T00:00:00+00:00"
  ],
  "warnings": [
    {
      "code": "DOM_DOW_OR",
      "severity": "warning",
      "field": "dayOfWeek",
      "message": "day-of-month \"1\" and day-of-week \"MON\" are both restricted, so the job runs on days that match EITHER of them (OR), not only days that match both."
    }
  ]
}
```

Use it as a check in CI to validate the schedules in your repository:

```yaml
- run: npx @saizul/cron-explain "$(yq '.on.schedule[0].cron' .github/workflows/nightly.yml)" --strict --tz UTC
```

## Supported syntax

```text
┌───────────── second (0-59, optional)
│ ┌─────────── minute (0-59)
│ │ ┌───────── hour (0-23)
│ │ │ ┌─────── day of month (1-31, L, LW, 15W)
│ │ │ │ ┌───── month (1-12 or JAN-DEC)
│ │ │ │ │ ┌─── day of week (0-7 or SUN-SAT; 0 and 7 are Sunday; 5L, 1#2)
│ │ │ │ │ │
* * * * * *
```

| Syntax | Meaning | Example |
| --- | --- | --- |
| `*` | every value | `* * * * *` |
| `?` | same as `*`, day fields only | `0 12 ? * MON` |
| `a,b` | list | `0,30 * * * *` |
| `a-b` | range (inclusive) | `0 9-17 * * *` |
| `*/n` | every n-th value from the start | `*/15 * * * *` |
| `a-b/n` | every n-th value in a range | `0 8-18/2 * * *` |
| `a/n` | every n-th value from `a` to the end | `5/10 * * * *` |
| `JAN`-`DEC`, `SUN`-`SAT` | names, any case | `0 0 * JAN-MAR MON-FRI` |
| `L` | last day of the month | `0 0 L * *` |
| `LW` | last weekday (Mon-Fri) of the month | `0 17 LW * *` |
| `15W` | weekday nearest the 15th, within the month | `0 9 15W * *` |
| `5L` | last Friday of the month | `0 18 * * 5L` |
| `1#2` | second Monday of the month (1-5) | `0 10 * * MON#2` |
| `@yearly`, `@annually` | `0 0 1 1 *` | |
| `@monthly` | `0 0 1 * *` | |
| `@weekly` | `0 0 * * 0` | |
| `@daily`, `@midnight` | `0 0 * * *` | |
| `@hourly` | `0 * * * *` | |
| `@reboot` | once at startup (no clock schedule) | |

Not supported, each with a clear `UNSUPPORTED` error: a 7th year field,
`L-3` (offset from the end of the month), `L` alone in day-of-week, Jenkins
`H` hashes and `@every 5m`. Backwards ranges such as `22-2` are rejected
with a hint to write `22-23,0-2`.

## Examples

Every row in this table is checked against the code by the test suite.

| Expression | English | বাংলা |
| --- | --- | --- |
| `* * * * *` | Every minute | প্রতি মিনিটে |
| `*/5 * * * *` | Every 5 minutes | প্রতি ৫ মিনিট পরপর |
| `*/15 9-17 * * 1-5` | Every 15 minutes, between 09:00 and 17:59, Monday through Friday | সোমবার থেকে শুক্রবার, ০৯:০০ থেকে ১৭:৫৯-এর মধ্যে, প্রতি ১৫ মিনিট পরপর |
| `0 9 * * 1-5` | At 09:00, Monday through Friday | সোমবার থেকে শুক্রবার, ০৯:০০-এ |
| `30 2 * * *` | At 02:30, every day | প্রতিদিন ০২:৩০-এ |
| `0 9,17 * * *` | At 09:00 and 17:00, every day | প্রতিদিন ০৯:০০ ও ১৭:০০-এ |
| `0 * * * *` | Every hour | প্রতি ঘণ্টায় |
| `0 */2 * * *` | Every 2 hours | প্রতি ২ ঘণ্টা পরপর |
| `15 */6 * * *` | Every 6 hours, at minute 15 | প্রতি ৬ ঘণ্টা পরপর, ১৫ মিনিটে |
| `5 * * * *` | At minute 5 of every hour | প্রতি ঘণ্টার ৫ মিনিটে |
| `0 9-17 * * *` | Every hour from 09:00 through 17:00 | ০৯:০০ থেকে ১৭:০০ পর্যন্ত প্রতি ঘণ্টায় |
| `0 8-18/2 * * 1-5` | Every 2 hours from 08:00 through 18:00, Monday through Friday | সোমবার থেকে শুক্রবার, ০৮:০০ থেকে ১৮:০০ পর্যন্ত প্রতি ২ ঘণ্টা পরপর |
| `* 9 * * *` | Every minute, between 09:00 and 09:59 | ০৯:০০ থেকে ০৯:৫৯-এর মধ্যে, প্রতি মিনিটে |
| `@daily` | At 00:00, every day | প্রতিদিন ০০:০০-এ |
| `@weekly` | At 00:00, on Sunday | রবিবারে, ০০:০০-এ |
| `@monthly` | At 00:00, on day 1 of the month | মাসের ১ তারিখে, ০০:০০-এ |
| `@reboot` | At system startup | সিস্টেম চালু হওয়ার সময় |
| `0 0 1,15 * *` | At 00:00, on days 1 and 15 of the month | মাসের ১ ও ১৫ তারিখে, ০০:০০-এ |
| `0 0 L * *` | At 00:00, on the last day of the month | মাসের শেষ দিনে, ০০:০০-এ |
| `0 17 LW * *` | At 17:00, on the last weekday of the month | মাসের শেষ কর্মদিবসে (সোম–শুক্র), ১৭:০০-এ |
| `0 9 15W * *` | At 09:00, on the weekday nearest day 15 of the month | মাসের ১৫ তারিখের নিকটতম কর্মদিবসে (সোম–শুক্র), ০৯:০০-এ |
| `0 18 * * 5L` | At 18:00, on the last Friday of the month | মাসের শেষ শুক্রবারে, ১৮:০০-এ |
| `0 10 * * MON#1` | At 10:00, on the first Monday of the month | মাসের প্রথম সোমবারে, ১০:০০-এ |
| `0 12 * * MON,WED,FRI` | At 12:00, on Monday, Wednesday and Friday | সোমবার, বুধবার ও শুক্রবারে, ১২:০০-এ |
| `0 0 1 * 1` | At 00:00, on day 1 of the month or on Monday | মাসের ১ তারিখে অথবা সোমবারে, ০০:০০-এ |
| `0 0 * JAN-MAR *` | At 00:00, January through March | জানুয়ারি থেকে মার্চ মাসে, ০০:০০-এ |
| `0 0 1 */3 *` | At 00:00, on day 1 of the month, every 3 months | প্রতি ৩ মাস অন্তর, মাসের ১ তারিখে, ০০:০০-এ |
| `*/10 * * * * *` | Every 10 seconds | প্রতি ১০ সেকেন্ড পরপর |
| `30 0 9 * * *` | At 09:00:30, every day | প্রতিদিন ০৯:০০:৩০-এ |

## Warnings

`lint()`, `validate()` and the CLI report expressions that are valid but
probably not what you meant. Severity `warning` is likely a bug; `info` is
worth knowing.

| Code | Severity | Example | What it means |
| --- | --- | --- | --- |
| `EVERY_MINUTE` | warning | `* * * * *` | Runs 1,440 times a day. |
| `EVERY_SECOND` | warning | `* * * * * *` | Runs 86,400 times a day. |
| `EVERY_MINUTE_IN_HOUR` | warning | `* 9 * * *` | Runs every minute from 09:00 to 09:59, not once at 09:00. Use `0 9 * * *`. |
| `DOM_DOW_OR` | warning | `0 0 1 * MON` | With both day fields restricted, cron runs on the 1st **or** on Mondays, not "Monday the 1st". |
| `STEP_OVERFLOW` | warning | `*/60 * * * *` | The step is larger than the range, so it only matches the first value. `*/90` cannot mean "every 90 minutes". |
| `NEVER_RUNS` | warning | `0 0 30 2 *` | No selected month has that day. |
| `UNEVEN_STEP` | info | `*/7 * * * *` | Steps restart every hour: 0, 7, ... 56, then 0 again, a gap of 4 minutes. |
| `SKIPS_SHORT_MONTHS` | info | `0 0 31 * *` | Day 31 is skipped in February, April, June, September and November. Use `L`. |
| `DST_SENSITIVE` | info | `30 2 * * *` with `tz: 'America/New_York'` | The time falls in an hour that a daylight-saving change skips or repeats in that zone. |

## Time zones and daylight saving time

Expressions are read in wall-clock time of the zone you pass as `tz` (an
IANA name such as `Asia/Dhaka`, `Europe/London`, `UTC`). Without `tz` the
system zone is used. Conversions use `Intl.DateTimeFormat`, so there is no
time zone database to ship or update.

On the days when clocks change, cron-explain follows the behaviour of the
classic Vixie/cronie cron daemon:

- **Skipped hour** (spring forward): a run whose local time does not exist
  happens when the clock reaches it, shifted by the gap. In New York on
  2026-03-08, `30 2 * * *` runs at 03:30 EDT. Runs are never duplicated or
  reordered: `*/30 * * * *` goes 01:00, 01:30, 03:00, 03:30.
- **Repeated hour** (fall back): a job with a fixed hour runs once, at the
  first occurrence. A job whose hour field is `*` runs in both copies of the
  hour, because it is meant to run all the time: `*/30 * * * *` on
  2026-11-01 runs at 01:00 EDT, 01:30 EDT, 01:00 EST, 01:30 EST.

## API reference

All functions accept either an expression string or a `CronExpression`
returned by `parse()`, so you can parse once and reuse it.

### `parse(expression, options?) => CronExpression`

Parses and validates. Throws a [`CronError`](#errors) listing every invalid
field. `options.seconds` is `'optional'` (default: 5 or 6 fields),
`'required'` (6 only) or `'forbidden'` (5 only).

The result has `source`, `macro?`, `reboot`, `hasSeconds` and one
`CronField` per field (`second`, `minute`, `hour`, `dayOfMonth`, `month`,
`dayOfWeek`). Each field has the `source` text, the parsed `parts`, the
sorted `values` it matches and `any` (true for `*` or `?`).

### `validate(expression, options?) => ValidationResult`

Never throws for bad input. Returns `{ valid, errors, warnings, expression? }`.
`options` are the parse options plus `tz` for the DST check.

### `lint(expression, options?) => CronWarning[]`

The warnings above, each `{ code, severity, message, field? }`. Pass `tz` to
enable `DST_SENSITIVE`.

### `explain(expression, options?) => string`

A plain-language description. `options.locale` is a registered code (`'en'`,
`'bn'`; region codes such as `'bn-BD'` fall back to the language) or a
`Locale` object.

### `nextRuns(expression, options?) => Date[]` and `previousRuns(...)`

The next run times strictly after `from`, or the previous ones strictly
before it, newest first. Options:

| Option | Default | |
| --- | --- | --- |
| `count` | `5` | 0 to 100,000 |
| `from` | now | `Date`, epoch milliseconds or an ISO string |
| `tz` | system zone | IANA time zone name |
| `seconds` | `'optional'` | as for `parse()` |

The search covers 28 years (every weekday and leap-year combination), so an
expression that never runs returns an empty array instead of looping.

### `nextRun(expression, options?)` and `previousRun(...)` `=> Date | null`

A single run time, or `null` when there is none.

### `isMatch(expression, date, { tz? }) => boolean`

True when the expression matches `date` to the second in the zone. A
5-field expression matches only at second 0.

### `normalize(expression) => string`

A canonical form: macros expanded, names replaced with numbers, `?` written
as `*`: `normalize('0 9 ? * MON-FRI')` is `'0 9 * * 1-5'`.

### `formatInTimeZone(date, tz?) => string`

ISO 8601 in a zone with its offset: `'2026-03-08T03:30:00-04:00'`.

### Locales

- `registerLocale(locale)` adds a language at runtime.
- `getLocale(code)` and `localeCodes()` look them up.
- `en` and `bn` are exported so you can extend them:
  `{ ...en, code: 'en-GB', sentence: ... }`.
- `timeShape(expr)` is the pre-analysis each locale receives; useful when
  writing one. See [CONTRIBUTING.md](CONTRIBUTING.md#how-to-add-a-locale).

## Errors

Invalid input throws a `CronError` with a `code`, the `field` and `token`
it is about, and an `issues` array with every problem found.

```ts
import { CronError, parse } from '@saizul/cron-explain';

try {
  parse('99 99 * * *');
} catch (err) {
  if (err instanceof CronError) {
    err.code; // 'OUT_OF_RANGE'
    err.message; // 'minute: 99 is out of range (0-59) (and 1 more)'
    err.issues.map((i) => i.field); // [ 'minute', 'hour' ]
  }
}
```

| Code | When |
| --- | --- |
| `EMPTY` | The expression is empty |
| `FIELD_COUNT` | Not 5 or 6 fields, or the count does not match `seconds` |
| `UNKNOWN_MACRO` | An `@name` that is not supported |
| `INVALID_TOKEN` | Not a number, an empty list item, or `?` outside the day fields |
| `OUT_OF_RANGE` | A value outside the field's range, or `#` not 1-5 |
| `INVALID_RANGE` | A backwards or malformed range |
| `INVALID_STEP` | A step of 0, not a number, or two `/` |
| `UNKNOWN_NAME` | A name that is not `JAN`-`DEC` or `SUN`-`SAT` in its field |
| `UNSUPPORTED` | Valid in some cron dialects but not here (year field, `L-3`, `H`, `@every`) |
| `INVALID_TIMEZONE` | `tz` is not a time zone `Intl` knows |
| `INVALID_OPTION` | A bad `count`, `from` or `locale` |
| `NO_SCHEDULE` | Asking for run times of `@reboot` |

## FAQ

**Why does `0 0 1 * MON` run every Monday?**
Because cron joins day-of-month and day-of-week with OR when both are
restricted. That is how Vixie cron, cronie, and most Unix crons have always
worked. If you need "Monday the 1st", schedule `0 0 * * MON` and check the
date in the job (`[ "$(date +%d)" = 01 ]`). cron-explain warns with
`DOM_DOW_OR` and says "or" in the description.

**Is `*/2` in day-of-week treated as restricted?**
Yes. A field is unrestricted only when it is exactly `*` or `?`. (Vixie cron
also treats any field that *starts* with `*` as unrestricted; that quirk is
not copied, because the result surprises people.)

**Why is `*/7` not every 7 minutes?**
Steps count within the field, and the field restarts each hour: `*/7` is
0, 7, ..., 56, then 0 of the next hour. Use a step that divides 60 evenly,
or run more often and decide in the job.

**What does `W` mean in Bangladesh, where the weekend is Friday and Saturday?**
In cron syntax `W` always means Monday to Friday, so `15W` and `LW` follow
that rule everywhere. The Bangla description says so: "কর্মদিবস (সোম–শুক্র)".

**Does it support seconds?**
Yes, as an optional first field (6 fields), as used by Quartz, node-cron,
croner and Spring. Pass `seconds: 'forbidden'` to accept only standard
5-field crontab lines.

**Which time zone does the CLI use?**
The system zone unless you pass `--tz`. Servers often run in UTC while you
think in local time, so pass `--tz` explicitly when you check a production
schedule. GitHub Actions `schedule:` triggers always use UTC.

**Why 24-hour times?**
They are unambiguous in both languages and match crontab. A 12-hour option
is on the roadmap.

**Can I use it in the browser?**
Yes. The library uses only `Intl` and `Date`; the CLI is the only part that
needs Node.

## Roadmap

Ideas marked **good first issue** are small, self-contained and a good way
to make a first contribution. Comment on the issue to claim one.

- **good first issue**: add a locale: Hindi (`hi`), Urdu (`ur`), Spanish
  (`es`), Arabic (`ar`), Indonesian (`id`)... See the
  [locale guide](CONTRIBUTING.md#how-to-add-a-locale).
- **good first issue**: a `--hour12` / `hour12: true` option for "9:00 AM"
  style times in English (and "সকাল ৯টা" in Bangla).
- **good first issue**: translate warning messages through the locale, so
  `--locale bn` prints Bangla warnings too.
- **good first issue**: `--format table|plain` for the CLI, or
  `--no-description` to print only run times for scripts.
- **good first issue**: a `NO_LEADING_ZERO` style check for typos such as
  `0 09 * * *` vs `0 9 * * *` (harmless, but worth an `info`).
- **good first issue**: more examples in `examples/` (GitHub Actions,
  Kubernetes CronJob, systemd timer comparison).
- `L-n` offsets (`L-3` = three days before the end of the month).
- Optional year field (Quartz style).
- `--explain-file crontab` to annotate every line of a crontab file.
- Wrap-around ranges such as `FRI-MON` and `22-2`, behind an option.

## Contributing

Contributions of every size are welcome: a new language, a better Bangla
phrasing, a test for an odd expression, or a typo fix. Start with
[CONTRIBUTING.md](CONTRIBUTING.md), which has a list of beginner-friendly
issues and a step-by-step guide to adding a locale.

```console
$ git clone https://github.com/saizul/cron-explain.git
$ cd cron-explain
$ npm ci
$ npm test
```

Please follow the [code of conduct](CODE_OF_CONDUCT.md). Security problems
go through [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) © Saizul Amin
