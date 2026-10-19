import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseOrgHost, parseOrgInput, parseOrgUrl, recordUrl, searchUrl } from '../src/lib/orgs.js';

test('recognizes production org hosts', () => {
  const expected = { myDomain: 'acme', kind: 'production', host: 'acme.my.salesforce.com' };
  assert.deepEqual(parseOrgHost('acme.my.salesforce.com'), expected);
  assert.deepEqual(parseOrgHost('acme.lightning.force.com'), expected);
  assert.deepEqual(parseOrgHost('acme.my.salesforce-setup.com'), expected);
  assert.deepEqual(parseOrgHost('ACME.Lightning.Force.com'), expected);
});

test('recognizes sandbox and other org types', () => {
  assert.deepEqual(parseOrgHost('acme--uat.sandbox.lightning.force.com'), {
    myDomain: 'acme--uat', kind: 'sandbox', host: 'acme--uat.sandbox.my.salesforce.com',
  });
  assert.equal(parseOrgHost('acme-dev-ed.develop.my.salesforce.com').kind, 'develop');
  assert.equal(parseOrgHost('fun-org-123.scratch.lightning.force.com').kind, 'scratch');
  assert.equal(parseOrgHost('curious-fox-abc.trailblaze.my.salesforce.com').kind, 'trailblaze');
});

test('treats legacy sandbox hosts without a "sandbox." segment as sandboxes', () => {
  assert.deepEqual(parseOrgHost('acme--uat.my.salesforce.com'), {
    myDomain: 'acme--uat', kind: 'sandbox', host: 'acme--uat.my.salesforce.com',
  });
});

test('strips the namespace from Visualforce hosts', () => {
  assert.equal(parseOrgHost('acme--c.vf.force.com').host, 'acme.my.salesforce.com');
  assert.equal(parseOrgHost('acme--uat--c.sandbox.vf.force.com').host, 'acme--uat.sandbox.my.salesforce.com');
});

test('ignores pages that are not inside an org', () => {
  for (const host of ['login.salesforce.com', 'test.salesforce.com', 'www.salesforce.com',
    'acme.my.site.com', 'help.salesforce.com', 'example.com', 'evil.com.my.salesforce.com.attacker.net']) {
    assert.equal(parseOrgHost(host), null, host);
  }
});

test('parses full tab URLs and requires https', () => {
  assert.equal(parseOrgUrl('https://acme.lightning.force.com/lightning/page/home').host, 'acme.my.salesforce.com');
  assert.equal(parseOrgUrl('http://acme.lightning.force.com/'), null);
  assert.equal(parseOrgUrl('chrome://extensions'), null);
  assert.equal(parseOrgUrl(undefined), null);
});

test('accepts URLs, hosts, and bare names on the options page', () => {
  assert.equal(parseOrgInput('https://acme.lightning.force.com/one/one.app').host, 'acme.my.salesforce.com');
  assert.equal(parseOrgInput('acme.my.salesforce.com/').host, 'acme.my.salesforce.com');
  assert.equal(parseOrgInput('acme').host, 'acme.my.salesforce.com');
  assert.equal(parseOrgInput('acme--uat').host, 'acme--uat.sandbox.my.salesforce.com');
  assert.equal(parseOrgInput('not a domain'), null);
  assert.equal(parseOrgInput(''), null);
});

test('builds record URLs for each interface', () => {
  const id = '001A0000006Vm9rIAC';
  assert.equal(recordUrl('acme.my.salesforce.com', id, 'auto'), `https://acme.my.salesforce.com/${id}`);
  assert.equal(recordUrl('acme.my.salesforce.com', id, 'classic'), `https://acme.my.salesforce.com/${id}`);
  assert.equal(recordUrl('acme--uat.sandbox.my.salesforce.com', id, 'lightning'),
    `https://acme--uat.sandbox.lightning.force.com/lightning/r/${id}/view`);
});

test('builds a Classic search URL with the term encoded', () => {
  assert.equal(searchUrl('acme.my.salesforce.com', 'Smith & Co', 'classic'),
    'https://acme.my.salesforce.com/_ui/search/ui/UnifiedSearchResults?searchType=2&str=Smith%20%26%20Co');
});

test('builds a Lightning search URL that round-trips non-ASCII terms', () => {
  const url = searchUrl('acme.my.salesforce.com', 'Müller', 'lightning');
  assert.ok(url.startsWith('https://acme.lightning.force.com/one/one.app#'));
  const json = Buffer.from(url.split('#')[1], 'base64').toString('utf8');
  assert.equal(JSON.parse(json).attributes.term, 'Müller');
});
