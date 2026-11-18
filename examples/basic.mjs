// Run after `npm run build`: node examples/basic.mjs
import { explain, formatInTimeZone, lint, nextRuns } from '../dist/esm/index.js';

const expression = '*/15 9-17 * * 1-5';
const tz = 'Asia/Dhaka';

console.log(expression);
console.log('en:', explain(expression));
console.log('bn:', explain(expression, { locale: 'bn' }));

for (const date of nextRuns(expression, { tz, count: 3, from: '2026-11-18T00:00:00Z' })) {
  console.log('  next:', formatInTimeZone(date, tz));
}

for (const w of lint('0 0 1 * MON')) console.log(`warning ${w.code}: ${w.message}`);
