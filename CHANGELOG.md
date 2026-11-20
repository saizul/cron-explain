# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- `cron-explain --file <crontab>` explains, checks and schedules every job in a
  crontab file (`-` reads standard input): description, next run (`--next N`,
  default 1 per job), warnings and per-line errors, with a summary and exit
  code `1` when a line is invalid. `CRON_TZ=` lines set the time zone of the
  jobs below them, `--system` reads `/etc/crontab` style files with a user
  column, and `--json` prints one entry per job.
- `parseCrontab(text, { system? })` in the library API: job lines with line
  numbers, user, command and `CRON_TZ`, environment variables and problems.
- `examples/crontab`.

## [0.1.0] - 2026-11-18

### Added

- `parse()` for 5-field and 6-field (seconds first) cron expressions with
  lists, ranges, steps, `?`, month and weekday names, day-of-week 7 as
  Sunday, and the `L`, `LW`, `nW`, `nL` and `n#k` extensions.
- Macros `@yearly`, `@annually`, `@monthly`, `@weekly`, `@daily`,
  `@midnight`, `@hourly` and `@reboot`.
- `CronError` with error codes, the field and token at fault, and every
  issue in the expression at once. Clear `UNSUPPORTED` errors for year
  fields, `L-n`, Jenkins `H` and `@every`.
- `explain()` in English (`en`) and Bangla (`bn`), with Bangla digits, and a
  `Locale` interface with `registerLocale()`, `getLocale()` and
  `timeShape()` for adding languages.
- `nextRuns()`, `previousRuns()`, `nextRun()`, `previousRun()` and
  `isMatch()` in any IANA time zone using `Intl`, with Vixie-cron style
  handling of skipped and repeated hours on daylight-saving days.
- `lint()` and `validate()` with warnings `EVERY_MINUTE`, `EVERY_SECOND`,
  `EVERY_MINUTE_IN_HOUR`, `DOM_DOW_OR`, `STEP_OVERFLOW`, `UNEVEN_STEP`,
  `NEVER_RUNS`, `SKIPS_SHORT_MONTHS` and `DST_SENSITIVE`.
- `normalize()` and `formatInTimeZone()`.
- The `cron-explain` CLI with `--next`, `--prev`, `--tz`, `--locale`,
  `--from`, `--seconds`, `--json` and `--strict`.
- ESM and CommonJS builds with type declarations; no runtime dependencies.

[Unreleased]: https://github.com/saizul/cron-explain/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/saizul/cron-explain/releases/tag/v0.1.0
