// Run after `npm run build`: node examples/custom-locale.mjs
// A locale can be registered at runtime. Here we tweak English to use
// "to" instead of "through"; a real locale would translate every phrase
// (see CONTRIBUTING.md, "How to add a locale").
import { en, explain, registerLocale } from '../dist/esm/index.js';

registerLocale({
  ...en,
  code: 'en-x-short',
  name: 'English (short)',
  sentence: (clauses) => en.sentence(clauses).replaceAll(' through ', ' to '),
});

console.log(explain('0 9 * * 1-5', { locale: 'en-x-short' }));
