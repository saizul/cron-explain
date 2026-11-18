# Security policy

## Supported versions

Only the latest release receives fixes.

## Reporting a vulnerability

Please do **not** open a public issue for security problems. Use GitHub's
private vulnerability reporting ("Report a vulnerability" under the
repository's **Security** tab). You will get an answer within a week.

## Scope

cron-explain parses untrusted text and is often used in web tools and CI.
Reports in these areas are especially welcome:

- **Denial of service.** Any expression or option that makes `parse()`,
  `explain()`, `lint()` or the run-time functions take far more than a
  fraction of a second, use unbounded memory or never return. Run-time
  searches are bounded to 28 years and `count` to 100,000; a way around
  those limits is a bug.
- **Output injection.** Error messages quote parts of the input. If you
  find a way to make the CLI print terminal escape sequences or break the
  `--json` output from an expression, please report it.

## What cron-explain is not

It describes and simulates schedules; it does not run jobs. The run times
it computes follow the documented Vixie/cronie behaviour, but your cron
daemon, cloud scheduler or library may differ in edge cases such as
daylight-saving days. Check critical schedules against the system that
actually runs them.
