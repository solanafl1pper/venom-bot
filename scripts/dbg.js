'use strict';

const fs = require('node:fs');

const t = fs.readFileSync('scripts/test-trigger.js', 'utf8');
const marker = "RPP)";
const i = t.indexOf(marker);
const seg = t.slice(i - 5, i + 40);
console.log('segment:', JSON.stringify(seg));
console.log('codes:', [...seg].map((c) => c.codePointAt(0).toString(16)).join(' '));

const j = t.indexOf("=== '");
console.log('---');
for (const line of t.split('\n')) {
  if (line.includes('normalize(')) {
    console.log(line.trim());
    console.log('  codes:', [...line].map((c) => c.codePointAt(0).toString(16)).join(' '));
  }
}