/**
 * Salesforce record ID helpers: validation, 15/18-character conversion,
 * key-prefix lookup, and pulling an ID out of pasted text or URLs.
 *
 * Pure functions with no browser APIs, so they can be unit tested in Node.
 */

// The 18-character suffix encodes, for each 5-character chunk of the
// 15-character ID, which positions are uppercase letters (one bit each).
const SUFFIX_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ012345';

const ID_15_OR_18 = /^[a-zA-Z0-9]{15}([a-zA-Z0-9]{3})?$/;

/**
 * Key prefixes (first three characters of an ID) for common standard objects.
 * Prefixes are case-sensitive: "00E" is UserRole but "00e" is Profile.
 */
export const KEY_PREFIXES = {
  '001': 'Account',
  '002': 'Note',
  '003': 'Contact',
  '005': 'User',
  '006': 'Opportunity',
  '00D': 'Organization',
  '00E': 'Role',
  '00G': 'Group or Queue',
  '00O': 'Report',
  '00P': 'Attachment',
  '00Q': 'Lead',
  '00T': 'Task',
  '00U': 'Event',
  '00X': 'Email Template',
  '00e': 'Profile',
  '00k': 'Opportunity Product',
  '00v': 'Campaign Member',
  '015': 'Document',
  '01Z': 'Dashboard',
  '01p': 'Apex Class',
  '01s': 'Price Book',
  '01t': 'Product',
  '01u': 'Price Book Entry',
  '02i': 'Asset',
  '02s': 'Email Message',
  '068': 'Content Version',
  '069': 'Content Document',
  '0PS': 'Permission Set',
  '0Q0': 'Quote',
  '0QL': 'Quote Line Item',
  '0WO': 'Work Order',
  '500': 'Case',
  '701': 'Campaign',
  '800': 'Contract',
  '801': 'Order',
  '802': 'Order Product',
};

/** Computes the 3-character case-checksum suffix for a 15-character ID. */
export function checksumSuffix(id15) {
  let suffix = '';
  for (let chunk = 0; chunk < 3; chunk++) {
    let bits = 0;
    for (let i = 0; i < 5; i++) {
      const ch = id15[chunk * 5 + i];
      if (ch >= 'A' && ch <= 'Z') bits |= 1 << i;
    }
    suffix += SUFFIX_ALPHABET[bits];
  }
  return suffix;
}

/**
 * Validates a 15- or 18-character ID and returns both forms.
 *
 * For 18-character IDs the suffix is treated as the source of truth for
 * letter case, which repairs IDs that were lowercased or uppercased by a
 * spreadsheet or another tool. Returns null when the input is not an ID.
 *
 * @returns {{id15: string, id18: string, prefix: string, caseCorrected: boolean} | null}
 */
export function parseId(input) {
  const raw = String(input ?? '').trim();
  if (!ID_15_OR_18.test(raw) || !looksLikeId(raw)) return null;

  if (raw.length === 15) {
    return { id15: raw, id18: raw + checksumSuffix(raw), prefix: raw.slice(0, 3), caseCorrected: false };
  }

  const suffix = raw.slice(15).toUpperCase();
  let id15 = '';
  for (let chunk = 0; chunk < 3; chunk++) {
    const bits = SUFFIX_ALPHABET.indexOf(suffix[chunk]);
    if (bits < 0) return null;
    for (let i = 0; i < 5; i++) {
      const ch = raw[chunk * 5 + i];
      const upper = (bits >> i) & 1;
      // A bit set on a digit means the suffix does not belong to this ID.
      if (upper && /[0-9]/.test(ch)) return null;
      id15 += upper ? ch.toUpperCase() : ch.toLowerCase();
    }
  }
  return {
    id15,
    id18: id15 + suffix,
    prefix: id15.slice(0, 3),
    caseCorrected: id15 !== raw.slice(0, 15),
  };
}

/**
 * Real IDs mix letters and digits. Requiring both keeps 15-letter words and
 * 15-digit order or phone numbers from being mistaken for record IDs.
 */
function looksLikeId(token) {
  return /[0-9]/.test(token) && /[a-zA-Z]/.test(token);
}

/** Returns a human-readable object name for an ID's key prefix. */
export function objectTypeFor(prefix) {
  if (KEY_PREFIXES[prefix]) return KEY_PREFIXES[prefix];
  // Custom object key prefixes start with a lowercase "a" (a00 to aZZ).
  if (/^a[0-9A-Za-z]{2}$/.test(prefix)) return 'Custom object';
  return 'Unrecognized object';
}

/**
 * Finds a record ID in free text: a bare ID, a Salesforce record URL, or a
 * sentence such as "can you check 0015g00000AbCdE?". Returns the first match
 * parsed by parseId, or null.
 */
export function extractId(text) {
  const raw = String(text ?? '').trim();
  const direct = parseId(raw);
  if (direct) return direct;

  // For URLs, search the path and query before the hostname, so a My Domain
  // name that happens to look like an ID is never picked up.
  const url = tryParseUrl(raw);
  if (url) {
    const fromPath = firstIdIn(url.pathname + ' ' + url.search + ' ' + url.hash);
    if (fromPath) return fromPath;
  }
  return firstIdIn(raw);
}

function firstIdIn(text) {
  for (const token of text.split(/[^a-zA-Z0-9]+/)) {
    const parsed = parseId(token);
    if (parsed) return parsed;
  }
  return null;
}

function tryParseUrl(text) {
  if (!/^https?:\/\//i.test(text)) return null;
  try {
    return new URL(text);
  } catch {
    return null;
  }
}
