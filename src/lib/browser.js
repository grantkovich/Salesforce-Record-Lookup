/**
 * Thin wrappers around the Chrome extension APIs. Everything is stored in
 * chrome.storage.local, which stays on this device and is not synced.
 */
import { addToHistory, targetUrl } from './lookup.js';

const DEFAULTS = {
  orgs: [], // [{host, myDomain, kind, label, ui}]
  defaultHost: null,
  openIn: 'newTab', // 'newTab' | 'currentTab'
  keepHistory: true,
  history: [],
};

export function getSettings() {
  return chrome.storage.local.get(DEFAULTS);
}

export function saveSettings(partial) {
  return chrome.storage.local.set(partial);
}

/** The active tab. Its URL is only readable after the user invokes the extension (activeTab). */
export async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab ?? null;
}

/**
 * Opens the destination for a resolved input and records it in history.
 * disposition follows the omnibox values: 'currentTab', 'newForegroundTab',
 * or 'newBackgroundTab'.
 */
export async function openLookup(resolved, org, { forceSearch = false, disposition, tabId } = {}) {
  const settings = await getSettings();
  const url = targetUrl(resolved, org, forceSearch);
  const mode = disposition ?? (settings.openIn === 'currentTab' ? 'currentTab' : 'newForegroundTab');

  // Save history first: the popup closes as soon as a new tab takes focus.
  if (settings.keepHistory) {
    await saveSettings({ history: addToHistory(settings.history, resolved, org, forceSearch) });
  }

  if (mode === 'currentTab' && tabId != null) {
    await chrome.tabs.update(tabId, { url });
  } else {
    await chrome.tabs.create({ url, active: mode !== 'newBackgroundTab' });
  }
}
