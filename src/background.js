/**
 * Service worker: handles the "sf" address bar keyword and first-run setup.
 */
import { getActiveTab, getSettings, openLookup } from './lib/browser.js';
import { pickOrg, resolveInput } from './lib/lookup.js';

// Send new users to the options page so they can add their org.
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') chrome.runtime.openOptionsPage();
});

chrome.omnibox.onInputChanged.addListener((text) => {
  chrome.omnibox.setDefaultSuggestion({ description: describe(resolveInput(text)) });
});

chrome.omnibox.onInputEntered.addListener(async (text, disposition) => {
  const resolved = resolveInput(text);
  if (!resolved) return;

  // Accepting an omnibox suggestion grants activeTab, so the tab URL is readable here.
  const [tab, settings] = await Promise.all([getActiveTab(), getSettings()]);
  const { org } = pickOrg(settings.orgs, settings.defaultHost, tab?.url);
  if (!org) {
    chrome.runtime.openOptionsPage();
    return;
  }

  // Plain Enter means "current tab"; respect the user's new-tab preference instead.
  const mode = disposition === 'currentTab' && settings.openIn === 'newTab'
    ? 'newForegroundTab'
    : disposition;
  await openLookup(resolved, org, { disposition: mode, tabId: tab?.id });
});

/** Suggestion text. Chrome parses it as XML, so user input must be escaped. */
function describe(resolved) {
  if (!resolved) return 'Enter a Salesforce record ID, record URL, or search term';
  if (resolved.kind === 'record') {
    return `Open ${escapeXml(resolved.objectType)} <url>${resolved.id.id18}</url>`;
  }
  return `Search Salesforce for <match>${escapeXml(resolved.term)}</match>`;
}

function escapeXml(text) {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
