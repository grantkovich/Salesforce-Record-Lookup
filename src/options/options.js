import { getSettings, saveSettings } from '../lib/browser.js';
import { ORG_KINDS, parseOrgInput } from '../lib/orgs.js';
import { toOrg } from '../lib/lookup.js';

const $ = (id) => document.getElementById(id);

const UI_OPTIONS = [
  ['auto', 'Auto'],
  ['lightning', 'Lightning'],
  ['classic', 'Classic'],
];

let settings;

init();

async function init() {
  settings = await getSettings();
  renderOrgs();

  for (const radio of document.querySelectorAll('input[name="openIn"]')) {
    radio.checked = radio.value === settings.openIn;
    radio.addEventListener('change', () => save({ openIn: radio.value }));
  }
  $('keep-history').checked = settings.keepHistory;
  $('keep-history').addEventListener('change', (e) => save({ keepHistory: e.target.checked }));
  $('clear-history').addEventListener('click', () => save({ history: [] }, 'Recent lookups cleared.'));
  $('add-org').addEventListener('submit', addOrg);
  // Chrome only lets the user change shortcuts on this built-in page.
  $('change-shortcut').addEventListener('click', () => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }));

  const commands = await chrome.commands.getAll();
  const shortcut = commands.find((c) => c.name === '_execute_action')?.shortcut;
  if (shortcut) $('shortcut').textContent = shortcut;
}

async function save(partial, message = 'Saved.') {
  Object.assign(settings, partial);
  await saveSettings(partial);
  const status = $('status');
  status.textContent = message;
  clearTimeout(save.timer);
  save.timer = setTimeout(() => (status.textContent = ''), 1500);
}

function saveOrgs() {
  const { orgs } = settings;
  // Keep a valid default whenever at least one org is saved.
  const defaultHost = orgs.some((o) => o.host === settings.defaultHost)
    ? settings.defaultHost
    : orgs[0]?.host ?? null;
  return save({ orgs, defaultHost });
}

// ---- Org table ----

function renderOrgs() {
  const rows = $('org-rows');
  rows.replaceChildren();
  $('org-table').hidden = settings.orgs.length === 0;
  $('no-orgs').hidden = settings.orgs.length > 0;

  for (const org of settings.orgs) {
    const tr = document.createElement('tr');

    const label = document.createElement('input');
    label.type = 'text';
    label.value = org.label;
    label.setAttribute('aria-label', `Name for ${org.host}`);
    label.addEventListener('change', () => {
      org.label = label.value.trim() || org.myDomain;
      label.value = org.label;
      saveOrgs();
    });

    // Allow long host names to wrap only after a dot.
    const host = document.createElement('code');
    org.host.split('.').forEach((part, i, parts) => {
      host.append(i < parts.length - 1 ? `${part}.` : part);
      if (i < parts.length - 1) host.append(document.createElement('wbr'));
    });

    const ui = document.createElement('select');
    ui.setAttribute('aria-label', `Interface for ${org.host}`);
    for (const [value, text] of UI_OPTIONS) ui.add(new Option(text, value));
    ui.value = org.ui;
    ui.addEventListener('change', () => {
      org.ui = ui.value;
      saveOrgs();
    });

    const isDefault = document.createElement('input');
    isDefault.type = 'radio';
    isDefault.name = 'default-org';
    isDefault.checked = org.host === settings.defaultHost;
    isDefault.setAttribute('aria-label', `Make ${org.label} the default org`);
    isDefault.addEventListener('change', () => save({ defaultHost: org.host }));

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'link danger';
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => {
      settings.orgs = settings.orgs.filter((o) => o.host !== org.host);
      saveOrgs().then(renderOrgs);
    });

    for (const child of [label, host, ORG_KINDS[org.kind] ?? org.kind, ui, isDefault, remove]) {
      const td = document.createElement('td');
      td.append(child);
      tr.append(td);
    }
    rows.append(tr);
  }
}

async function addOrg(event) {
  event.preventDefault();
  const error = $('add-error');
  const parsed = parseOrgInput($('org-address').value);

  if (!parsed) {
    error.textContent = 'That does not look like a Salesforce org address. Try copying the URL from a tab in your org.';
    error.hidden = false;
    return;
  }
  if (settings.orgs.some((o) => o.host === parsed.host)) {
    error.textContent = `${parsed.host} is already saved.`;
    error.hidden = false;
    return;
  }

  error.hidden = true;
  settings.orgs.push(toOrg(parsed, $('org-label').value.trim()));
  $('add-org').reset();
  await saveOrgs();
  renderOrgs();
}
