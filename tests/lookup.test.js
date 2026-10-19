import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addToHistory, HISTORY_LIMIT, pickOrg, resolveInput, targetUrl } from '../src/lib/lookup.js';

const prod = { host: 'acme.my.salesforce.com', myDomain: 'acme', kind: 'production', label: 'Acme', ui: 'auto' };
const uat = { host: 'acme--uat.sandbox.my.salesforce.com', myDomain: 'acme--uat', kind: 'sandbox', label: 'UAT', ui: 'lightning' };

test('classifies input as a record or a search', () => {
  assert.equal(resolveInput('001A0000006Vm9r').kind, 'record');
  assert.equal(resolveInput('001A0000006Vm9r').objectType, 'Account');
  assert.deepEqual(resolveInput('  Jane Smith '), { kind: 'search', term: 'Jane Smith' });
  assert.equal(resolveInput('   '), null);
});

test('uses the org of the current tab first', () => {
  const result = pickOrg([prod, uat], prod.host, 'https://acme--uat.sandbox.lightning.force.com/lightning/page/home');
  assert.equal(result.org, uat);
  assert.equal(result.detected, true);
});

test('offers an unsaved org detected from the current tab', () => {
  const result = pickOrg([prod], prod.host, 'https://other.lightning.force.com/');
  assert.equal(result.org.host, 'other.my.salesforce.com');
  assert.equal(result.saved, false);
});

test('falls back to the default org, then the first saved org', () => {
  assert.equal(pickOrg([prod, uat], uat.host, 'https://mail.example.com/').org, uat);
  assert.equal(pickOrg([prod, uat], null, undefined).org, prod);
  assert.equal(pickOrg([], null, undefined).org, null);
});

test('opens records with the 18-character ID and respects forceSearch', () => {
  const resolved = resolveInput('001A0000006Vm9r');
  assert.equal(targetUrl(resolved, prod), 'https://acme.my.salesforce.com/001A0000006Vm9rIAC');
  assert.ok(targetUrl(resolved, prod, true).includes('/one/one.app#'));
});

test('history puts newest first, removes duplicates, and caps length', () => {
  let history = [];
  for (let i = 0; i < HISTORY_LIMIT + 3; i++) {
    history = addToHistory(history, resolveInput(`term ${i}`), prod, false, i);
  }
  assert.equal(history.length, HISTORY_LIMIT);
  assert.equal(history[0].value, `term ${HISTORY_LIMIT + 2}`);

  history = addToHistory(history, resolveInput('term 5'), prod, false, 100);
  assert.equal(history[0].value, 'term 5');
  assert.equal(history.filter((h) => h.value === 'term 5').length, 1);
});
