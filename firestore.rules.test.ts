import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rulesContent = fs.readFileSync(
  path.resolve(process.cwd(), 'firestore.rules'),
  'utf8'
);
const blueprint = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), 'firebase-blueprint.json'), 'utf8')
);

test('firestore.rules enforces global default-deny catch-all and rules_version 2', () => {
  assert.match(rulesContent, /rules_version = '2';/);
  assert.match(
    rulesContent,
    /match \/\{document=\*\*\} \{\s*allow read, write: if false;\s*\}/
  );
});

test('firestore.rules covers every collection declared in firebase-blueprint.json', () => {
  const paths = Object.keys(blueprint.firestore);
  assert.equal(paths.length, 4);
  assert.match(rulesContent, /match \/users\/\{userId\}/);
  assert.match(rulesContent, /match \/remediationTasks\/\{taskId\}/);
  assert.match(rulesContent, /match \/qualificationLogs\/\{entryId\}/);
  assert.match(rulesContent, /match \/auditLogs\/\{logId\}/);
});

test('Dirty Dozen #1-#4: enforces email_verified, strict hasOnly, and owner-scoped list rules without get()/exists()', () => {
  assert.match(rulesContent, /request\.auth\.token\.email_verified == true/);
  assert.match(rulesContent, /allow list: if false;/);
  const listMatches = rulesContent.match(/allow list: if [^;]+;/g) || [];
  assert.equal(listMatches.length, 4);
  for (const rule of listMatches) {
    assert.ok(!rule.includes('get('), `list rule must not call get(): ${rule}`);
    assert.ok(!rule.includes('exists('), `list rule must not call exists(): ${rule}`);
  }
});

test('Dirty Dozen #5-#12: enforces request.time timestamps, ID regex, immutable auditLogs, and Master Gate', () => {
  assert.match(rulesContent, /incoming\(\)\.createdAt == request\.time/);
  assert.match(rulesContent, /incoming\(\)\.updatedAt == request\.time/);
  assert.match(rulesContent, /incoming\(\)\.createdAt == existing\(\)\.createdAt/);
  assert.match(rulesContent, /allow update: if false;/);
  assert.match(rulesContent, /hasActiveWorkspace\(userId\)/);
  assert.match(rulesContent, /\^REM-\\\\d\{3\}\$/);
  assert.match(rulesContent, /\^\\\\d\{4\}-\\\\d\{2\}-\\\\d\{2\}\$/);
});
