/**
 * Turns what the user typed into a destination URL. Shared by the popup and
 * the omnibox ("sf" keyword). Pure functions, no browser APIs.
 */
import { extractId, objectTypeFor } from './sfid.js';
import { parseOrgUrl, recordUrl, searchUrl } from './orgs.js';

export const HISTORY_LIMIT = 10;

/**
 * Classifies input as a record lookup (if it contains a valid ID) or a search.
 * Returns null for empty input.
 */
export function resolveInput(text) {
  const term = String(text ?? '').trim();
  if (!term) return null;
  const id = extractId(term);
  if (id) return { kind: 'record', term, id, objectType: objectTypeFor(id.prefix) };
  return { kind: 'search', term };
}

/** Builds a saved-org record from parseOrgHost output. */
export function toOrg(parsed, label) {
  return {
    host: parsed.host,
    myDomain: parsed.myDomain,
    kind: parsed.kind,
    label: label || parsed.myDomain,
    ui: 'auto',
  };
}

/**
 * Chooses which org to use. The org of the current tab wins, because a user
 * working in a sandbox expects lookups to stay in that sandbox. Otherwise the
 * default saved org is used.
 *
 * @returns {{org: object|null, detected: boolean, saved: boolean}}
 */
export function pickOrg(orgs, defaultHost, tabUrl) {
  const detected = tabUrl ? parseOrgUrl(tabUrl) : null;
  if (detected) {
    const saved = orgs.find((o) => o.host === detected.host);
    return { org: saved ?? toOrg(detected), detected: true, saved: Boolean(saved) };
  }
  const org = orgs.find((o) => o.host === defaultHost) ?? orgs[0] ?? null;
  return { org, detected: false, saved: Boolean(org) };
}

/** URL for a resolved input. forceSearch runs a search even when an ID was found. */
export function targetUrl(resolved, org, forceSearch = false) {
  if (resolved.kind === 'record' && !forceSearch) {
    return recordUrl(org.host, resolved.id.id18, org.ui);
  }
  return searchUrl(org.host, resolved.term, org.ui);
}

/** Adds a lookup to the front of the history, removing duplicates. */
export function addToHistory(history, resolved, org, forceSearch = false, now = Date.now()) {
  const isRecord = resolved.kind === 'record' && !forceSearch;
  const entry = {
    kind: isRecord ? 'record' : 'search',
    value: isRecord ? resolved.id.id18 : resolved.term,
    label: isRecord ? resolved.objectType : 'Search',
    host: org.host,
    orgLabel: org.label,
    at: now,
  };
  const rest = history.filter(
    (h) => !(h.kind === entry.kind && h.value === entry.value && h.host === entry.host)
  );
  return [entry, ...rest].slice(0, HISTORY_LIMIT);
}
