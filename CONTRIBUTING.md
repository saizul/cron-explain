# Contributing

Thanks for helping improve cron-explain. New languages, better phrasing,
bug reports with odd expressions, new warnings and documentation fixes are
all welcome. If you are new to open source, start with one of the
[beginner issues](#good-first-issues) below; each is small and comes with
pointers to the files involved.

## Reporting a bug

Open an issue with:

- the expression and the options (`tz`, `locale`, `from`) you used
- what you got and what you expected, e.g. the run times your real cron
  daemon produced
- your cron-explain and Node versions (`node --version`)

A wrong description in your language is a bug too. Tell us the sentence you
got and the sentence a native speaker would write.

## Development setup

You need Node 20 or newer.

```console
$ git clone https://github.com/saizul/cron-explain.git
$ cd cron-explain
$ npm ci
$ npm test              # builds ESM + CJS, compiles the tests and runs node:test
$ npm run lint          # biome lint + tsc --noEmit
$ npm run format        # biome format --write
$ npm run format:check  # what CI runs
```

Try the CLI from the build:

```console
$ node dist/esm/cli.js "*/15 9-17 * * 1-5" --tz Asia/Dhaka --locale bn
```

## Guidelines

- **Zero runtime dependencies.** Only the JavaScript standard library and
  `Intl`. Development tools go in `devDependencies`.
- **The library must not need Node.** Only `src/cli.ts` and `src/cli/` may
  use Node APIs, so the library keeps working in browsers and edge runtimes.
- **Tests pin exact output.** Descriptions and run times are compared as
  whole strings. When you change a phrase, update the tests and the
  examples table in the README (a test checks that the table matches).
- **Codes are public API.** Error codes, warning codes and locale codes are
  used in other people's code, so do not rename them outside a major
  release.
- **Time zone tests use fixed dates.** Always pass `from` and `tz`, never
  rely on the current time or the machine's zone.
- Every change comes with a test and a line in the `Unreleased` section of
  `CHANGELOG.md`.

## Project layout

```text
src/
  parse.ts         tokenizer and parser, normalize()
  fields.ts        field ranges, names and macros
  schedule.ts      nextRuns(), previousRuns(), isMatch(), DST handling
  timezone.ts      Intl helpers: offsets, formatting, DST transitions
  lint.ts          lint() and validate()
  explain/         explain() and timeShape(), the shared pre-analysis
  locales/         one file per language, plus the registry
  cli.ts, cli/     command-line interface
test/              node:test suites (one per module) and helpers
examples/          runnable ESM and CommonJS examples
```

## How to add a locale

A locale is one TypeScript file that turns structured data into phrases.
The parsing and the hard decisions (is this a list of exact times? a fixed
minute in a run of hours?) are done for you by `timeShape()` in
`src/explain/shape.ts`; a locale only chooses words and word order.

1. **Copy the reference.** Copy `src/locales/en.ts` to
   `src/locales/<code>.ts`, using a [BCP 47](https://www.rfc-editor.org/info/bcp47)
   code such as `hi`, `es` or `pt-BR`. `src/locales/bn.ts` is a second
   example for a language with a different word order and its own digits.
2. **Translate the names.** Fill `WEEKDAYS` (Sunday first) and `MONTHS`
   (January first). If the language has its own digits, implement
   `digits()` like `bn.ts` does; otherwise keep `(text) => text`.
3. **Translate the phrases.** Work through `time()`, `dayOfMonth()`,
   `dayOfWeek()`, `month()` and `sentence()`. Each receives either a
   `TimeShape` or a list of `CronPart`s (see `src/types.ts`):
   - `time(shape)`: `times` is a short list of exact clock times;
     `hourly` is a fixed minute every N hours, optionally from/to;
     `generic` is everything else, one phrase per field.
   - The day and month functions are only called for restricted fields.
     Parts are `value`, `range` (with `step` and `wildcard`) and the
     specials `lastDay`, `lastWeekday`, `nearestWeekday`, `lastOfMonth`
     and `nth`.
   - `sentence(clauses)` joins the rendered clauses. Put them in the order
     that is natural for your language; Bangla puts the day first.
4. **Translate the CLI labels** in `labels`.
5. **Register it.** Import it in `src/locales/index.ts`, add it to the
   `registry` map and to the `export { ... }` line, then export it from
   `src/index.ts` next to `en` and `bn`.
6. **Test it.** Create `test/locale-<code>.test.ts` with at least the
   expressions from `EXAMPLES` in `test/explain.test.ts`, and add a column
   or a separate table to the README examples if you like. Ask a second
   native speaker to review the wording in the pull request.
7. **Document it.** Add the code to the locale list in the README and a line
   to `CHANGELOG.md`.

Tips:

- Keep the 24-hour clock unless the whole locale switches; a 12-hour option
  is a separate feature on the roadmap.
- Keep numbers as digits ("every 15 minutes", not "every fifteen minutes").
- Grammar that depends on the word, such as Bangla's `সোমবার` → `সোমবারে`,
  belongs in small helper functions inside your locale file.
- Users can also register a locale at runtime with `registerLocale()`
  without changing this repository, which is a quick way to try one out.

## Good first issues

These are deliberately small. Each one lists where to start.

1. **Add a Hindi locale (`hi`)**: follow the guide above; Devanagari
   digits are optional (`०१२३…`). Start from `src/locales/en.ts`.
2. **Add a Spanish locale (`es`)**: "Cada 15 minutos, entre las 09:00 y
   las 17:59, de lunes a viernes". Start from `src/locales/en.ts`.
3. **Translate warning messages**: add an optional `warnings` map to the
   `Locale` interface in `src/locales/types.ts`, use it in `src/lint.ts`
   when a locale is given, and translate the nine messages for `bn`.
4. **12-hour clock option**: add `hour12?: boolean` to `ExplainOptions` in
   `src/explain/index.ts`, pass it to the locale's `clock()` helper and add a
   `--hour12` flag in `src/cli/run.ts`. "At 9:00 AM, Monday through Friday".
5. **`--quiet` CLI flag**: print only the run times (one ISO string per
   line) for use in shell scripts. Change `src/cli/run.ts` and add tests in
   `test/cli.test.ts`.
6. **Warn about leading zeros**: an `info` warning for `09` style values,
   which are valid but sometimes copied from other formats. Add a code to
   `WarningCode` in `src/types.ts`, the check in `src/lint.ts`, and a row to
   the README warnings table.
7. **Better `@yearly` wording**: "At 00:00 on January 1" instead of "on day
   1 of the month, in January". Detect the single-day, single-month case in
   `sentence()` of `src/locales/en.ts` (and `bn.ts`: "১ জানুয়ারি").
8. **A GitHub Actions example**: add `examples/check-workflow-schedules.mjs`
   that reads `.github/workflows/*.yml`, finds `cron:` lines with a regular
   expression and prints `explain()` and `lint()` for each.

## Pull requests

Keep them focused: one fix or feature per pull request. Describe what
changed and how you tested it; the template has a short checklist. CI runs
lint, format check and the tests on Node 20 and 22 on Linux, and Node 22 on
Windows and macOS.
