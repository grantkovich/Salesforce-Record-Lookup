/**
 * Recognizes Salesforce org hostnames and builds record and search URLs.
 *
 * Only standard Salesforce domain formats are used, so this works for any
 * org with a My Domain (required for all orgs since 2023). Pure functions,
 * no browser APIs.
 */

// Hostname segment that marks a non-production org, e.g. acme--uat.sandbox.my.salesforce.com
export const ORG_KINDS = {
  production: 'Production',
  sandbox: 'Sandbox',
  develop: 'Developer Edition',
  scratch: 'Scratch org',
  trailblaze: 'Trailhead Playground',
  demo: 'Demo org',
  patch: 'Patch org',
};

const ORG_HOST = new RegExp(
  '^([a-z0-9_-]+?)' + // My Domain name, e.g. "acme" or "acme--uat"
  '(?:\\.(sandbox|develop|scratch|trailblaze|demo|patch))?' +
  '\\.(my\\.salesforce\\.com|lightning\\.force\\.com|my\\.salesforce-setup\\.com|vf\\.force\\.com)$'
);

/**
 * Parses a hostname from any page inside a Salesforce org (Lightning, Classic,
 * Setup, or Visualforce). Returns null for anything else, including
 * login.salesforce.com and Experience Cloud sites.
 *
 * @returns {{myDomain: string, kind: string, host: string} | null}
 *   host is always the canonical "my.salesforce.com" form.
 */
export function parseOrgHost(hostname) {
  const match = String(hostname ?? '').toLowerCase().match(ORG_HOST);
  if (!match) return null;

  let [, name, segment, domain] = match;
  // Visualforce hosts append a namespace: acme--c.vf.force.com
  if (domain === 'vf.force.com') {
    name = name.replace(/--[a-z0-9_]+$/, '');
  }
  if (!name || name.startsWith('-')) return null;

  // Before enhanced domains, sandboxes had no "sandbox." segment but always
  // contained "--" (acme--uat.my.salesforce.com).
  const kind = segment || (name.includes('--') ? 'sandbox' : 'production');
  const host = `${name}.${segment ? segment + '.' : ''}my.salesforce.com`;
  return { myDomain: name, kind, host };
}

/** Parses the org from a full tab URL. Returns null for non-Salesforce pages. */
export function parseOrgUrl(url) {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === 'https:' ? parseOrgHost(hostname) : null;
  } catch {
    return null;
  }
}

/**
 * Accepts what a user might type on the options page: a full URL, a hostname,
 * or a bare My Domain name ("acme", or "acme--uat" for a sandbox).
 */
export function parseOrgInput(text) {
  const value = String(text ?? '').trim().toLowerCase();
  if (!value) return null;
  if (value.includes('://')) return parseOrgUrl(value);
  if (value.includes('.')) return parseOrgHost(value.split('/')[0]);
  if (!/^[a-z0-9_-]+$/.test(value)) return null;
  return parseOrgHost(value.includes('--')
    ? `${value}.sandbox.my.salesforce.com`
    : `${value}.my.salesforce.com`);
}

function lightningHost(host) {
  return host.replace(/my\.salesforce\.com$/, 'lightning.force.com');
}

/**
 * URL that opens a record.
 *  - lightning: /lightning/r/<id>/view on the Lightning domain
 *  - classic and auto: /<id>, which Salesforce redirects to whichever
 *    interface the user has turned on
 */
export function recordUrl(host, id, ui = 'auto') {
  if (ui === 'lightning') {
    return `https://${lightningHost(host)}/lightning/r/${id}/view`;
  }
  return `https://${host}/${id}`;
}

/**
 * URL that runs a global search.
 *  - classic: the Classic search results page
 *  - lightning and auto: the Lightning search page. Lightning has no
 *    documented search URL; it reads a base64-encoded JSON page description
 *    from the URL hash, which is what Salesforce itself puts in the address
 *    bar after a search.
 */
export function searchUrl(host, term, ui = 'auto') {
  if (ui === 'classic') {
    return `https://${host}/_ui/search/ui/UnifiedSearchResults?searchType=2&str=${encodeURIComponent(term)}`;
  }
  const page = {
    componentDef: 'forceSearch:search',
    attributes: {
      term,
      scopeMap: { type: 'TOP_RESULTS' },
      context: { disableSpellCorrection: false, SEARCH_ACTIVITY: { term } },
    },
  };
  return `https://${lightningHost(host)}/one/one.app#${base64Utf8(JSON.stringify(page))}`;
}

// btoa only handles Latin-1, so encode to UTF-8 bytes first.
function base64Utf8(text) {
  let binary = '';
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary);
}
