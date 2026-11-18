import { run } from '../src/cli/run.js';

/** Runs the CLI in-process and captures its output. */
export function cli(args: string[], now = Date.parse('2026-11-18T00:00:00Z')) {
  let stdout = '';
  let stderr = '';
  const code = run(args, {
    stdout: (t) => {
      stdout += t;
    },
    stderr: (t) => {
      stderr += t;
    },
    now: () => now,
  });
  return { code, stdout, stderr };
}
