import { getActiveTab, getSettings, openLookup, saveSettings } from '../lib/browser.js';
import { parseOrgHost, ORG_KINDS } from '../lib/orgs.js';
import { pickOrg, resolveInput, toOrg } from '../lib/lookup.js';

const $ = (id) => document.getElementById(id);

const state = {
  tab: null,
  settings: null,
  orgsByHost: new Map(), // every org offered in the dropdown
  detectedHost: null, // org of the active tab, if it is a Salesforce page
  resolved: null, // current interpretation of the input box
};

init();

async function init() {
  [state.tab, state.settings] = await Promise.all([getActiveTab(), getSettings()]);
  renderOrgs();
  renderHistory();

  $('query').addEventListener('input', renderPreview);
  $('lookup-form').addEventListener('submit', (e) => {
    e.preventDefault();
    go(false);
  });
  $('query').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      go(true);
    }
  });
  $('search-instead').addEventListener('click', () => go(true));
  $('org').addEventListener('change', renderOrgActions);
  $('save-org').addEventListener('click', saveDetectedOrg);
  $('clear-history').addEventListener('click', clearHistory);
  $('open-settings').addEventListener('click', () => chrome.runtime.openOptionsPage());
  $('no-org-settings').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
}

// ---- Org selection ----

function renderOrgs() {
  const { orgs, defaultHost } = state.settings;
  const { org, detected } = pickOrg(orgs, defaultHost, state.tab?.url);

  state.orgsByHost = new Map(orgs.map((o) => [o.host, o]));
  state.detectedHost = detected ? org.host : null;
  if (detected && !state.orgsByHost.has(org.host)) {
    state.orgsByHost.set(org.host, org);
  }

  const select = $('org');
  select.replaceChildren();
  for (const o of state.orgsByHost.values()) {
    const option = new Option(orgLabel(o), o.host);
    select.add(option);
  }
  if (org) select.value = org.host;

  $('org-row').hidden = !org;
  $('no-org').hidden = Boolean(org);
  $('query').disabled = !org;
  renderOrgActions();
}

function orgLabel(org) {
  const kind = ORG_KINDS[org.kind] ?? org.kind;
  let text = org.label === kind ? kind : `${org.label} (${kind})`;
  if (org.host === state.detectedHost) text += ', this tab';
  return text;
}

function selectedOrg() {
  return state.orgsByHost.get($('org').value) ?? null;
}

/** Offers "Save org" when the active tab's org is not saved yet. */
function renderOrgActions() {
  const org = selectedOrg();
  const saved = org && state.settings.orgs.some((o) => o.host === org.host);
  $('save-org').hidden = !org || saved;
}

async function saveDetectedOrg() {
  const org = selectedOrg();
  const orgs = [...state.settings.orgs, org];
  const defaultHost = state.settings.defaultHost ?? org.host;
  await saveSettings({ orgs, defaultHost });
  Object.assign(state.settings, { orgs, defaultHost });
  renderOrgActions();
}

// ---- Input preview ----

function renderPreview() {
  state.resolved = resolveInput($('query').value);
  const r = state.resolved;
  const preview = $('preview');
  const primary = $('primary');

  primary.disabled = !r;
  $('search-instead').hidden = r?.kind !== 'record';
  preview.hidden = !r;
  preview.replaceChildren();
  if (!r) {
    primary.textContent = 'Open';
    return;
  }

  if (r.kind === 'search') {
    primary.textContent = 'Search';
    preview.append(el('p', 'preview-search', `Search Salesforce for "${r.term}"`));
    return;
  }

  primary.textContent = `Open ${r.objectType === 'Unrecognized object' ? 'record' : r.objectType}`;
  const title = el('div', 'preview-title');
  title.append(el('strong', '', r.objectType));
  title.append(el('span', 'prefix', `prefix ${r.id.prefix}`));
  preview.append(title);
  preview.append(idRow('18-character', r.id.id18), idRow('15-character', r.id.id15));
  if (r.id.caseCorrected) {
    preview.append(el('p', 'note', 'Letter case restored from the 18-character checksum.'));
  }
}

function idRow(label, id) {
  const row = el('div', 'id-row');
  const copy = el('button', 'link', 'Copy');
  copy.type = 'button';
  copy.addEventListener('click', async () => {
    await navigator.clipboard.writeText(id);
    copy.textContent = 'Copied';
    setTimeout(() => (copy.textContent = 'Copy'), 1200);
  });
  row.append(el('span', 'id-label', label), el('code', '', id), copy);
  return row;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

// ---- Navigation ----

async function go(forceSearch) {
  const org = selectedOrg();
  if (!state.resolved || !org) return;
  await openLookup(state.resolved, org, { forceSearch, tabId: state.tab?.id });
  window.close();
}

// ---- History ----

function renderHistory() {
  const { history, keepHistory } = state.settings;
  const list = $('recent');
  list.replaceChildren();
  $('recent-section').hidden = !keepHistory || history.length === 0;

  for (const entry of history) {
    const button = el('button', 'recent-item');
    button.type = 'button';
    button.title = `Open in ${entry.orgLabel}`;
    button.append(el('span', 'recent-label', entry.label));
    button.append(el('span', 'recent-value', entry.value));
    button.append(el('span', 'recent-org', entry.orgLabel));
    button.addEventListener('click', () => reopen(entry));
    const li = document.createElement('li');
    li.append(button);
    list.append(li);
  }
}

async function reopen(entry) {
  const parsed = parseOrgHost(entry.host);
  const org = state.orgsByHost.get(entry.host) ?? (parsed && toOrg(parsed, entry.orgLabel));
  const resolved = entry.kind === 'record'
    ? resolveInput(entry.value)
    : { kind: 'search', term: entry.value };
  if (!org || !resolved) return;
  await openLookup(resolved, org, { forceSearch: entry.kind === 'search', tabId: state.tab?.id });
  window.close();
}

async function clearHistory() {
  await saveSettings({ history: [] });
  state.settings.history = [];
  renderHistory();
  $('query').focus();
}
