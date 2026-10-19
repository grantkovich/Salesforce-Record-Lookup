import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checksumSuffix, extractId, objectTypeFor, parseId } from '../src/lib/sfid.js';

// Example pair from Salesforce documentation.
const ID15 = '001A0000006Vm9r';
const ID18 = '001A0000006Vm9rIAC';

test('computes the 18-character suffix', () => {
  assert.equal(checksumSuffix(ID15), 'IAC');
  assert.equal(checksumSuffix('a0B5g000001abcd'), 'EAA');
  assert.equal(checksumSuffix('ABCDEABCDEABCDE'), '555');
});

test('converts 15 to 18 characters', () => {
  assert.deepEqual(parseId(ID15), { id15: ID15, id18: ID18, prefix: '001', caseCorrected: false });
});

test('converts 18 to 15 characters', () => {
  const parsed = parseId(ID18);
  assert.equal(parsed.id15, ID15);
  assert.equal(parsed.id18, ID18);
  assert.equal(parsed.caseCorrected, false);
});

test('repairs letter case of an 18-character ID using its suffix', () => {
  for (const mangled of [ID18.toLowerCase(), ID18.toUpperCase()]) {
    const parsed = parseId(mangled);
    assert.equal(parsed.id15, ID15);
    assert.equal(parsed.id18, ID18);
    assert.equal(parsed.caseCorrected, true);
  }
});

test('trims surrounding whitespace', () => {
  assert.equal(parseId(`  ${ID15}\n`).id18, ID18);
});

test('rejects things that are not IDs', () => {
  const notIds = [
    '',
    null,
    '001A0000006Vm9',       // 14 characters
    '001A0000006Vm9rI',     // 16 characters
    '001A0000006Vm9rIA',    // 17 characters
    '001A0000006Vm-r',      // invalid character
    'opportunityname',      // 15 letters, no digits
    '123456789012345',      // 15 digits, no letters
    '001A0000006Vm9r999',   // suffix character outside the alphabet
    '001A0000006Vm9rZAC',   // suffix marks a digit as uppercase
  ];
  for (const value of notIds) assert.equal(parseId(value), null, `expected null for ${value}`);
});

test('names standard objects from key prefixes', () => {
  assert.equal(objectTypeFor('001'), 'Account');
  assert.equal(objectTypeFor('003'), 'Contact');
  assert.equal(objectTypeFor('00Q'), 'Lead');
  assert.equal(objectTypeFor('006'), 'Opportunity');
  assert.equal(objectTypeFor('005'), 'User');
  assert.equal(objectTypeFor('500'), 'Case');
});

test('key prefixes are case-sensitive', () => {
  assert.equal(objectTypeFor('00E'), 'Role');
  assert.equal(objectTypeFor('00e'), 'Profile');
});

test('labels custom and unknown prefixes', () => {
  assert.equal(objectTypeFor('a0B'), 'Custom object');
  assert.equal(objectTypeFor('zzz'), 'Unrecognized object');
});

test('extracts an ID from a Lightning record URL', () => {
  const url = `https://acme.lightning.force.com/lightning/r/Account/${ID18}/view`;
  assert.equal(extractId(url).id18, ID18);
});

test('extracts an ID from a Classic URL', () => {
  assert.equal(extractId(`https://acme.my.salesforce.com/${ID15}?srPos=0`).id18, ID18);
});

test('prefers the URL path over an ID-shaped My Domain name', () => {
  const url = `https://acme2024corpxyz.my.salesforce.com/${ID15}`;
  assert.equal(extractId(url).id15, ID15);
});

test('extracts an ID from a sentence', () => {
  assert.equal(extractId(`Can you check ${ID15} before Friday?`).id15, ID15);
});

test('returns null when text has no ID', () => {
  assert.equal(extractId('Jane Smith at Acme'), null);
  assert.equal(extractId('https://acme.lightning.force.com/lightning/page/home'), null);
});
