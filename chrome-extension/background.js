const OPEN_MENU_ID = "open-in-annotator-connotator";
const QUESTION_MENU_ID = "ask-annotator-connotator";
const APP_URL = "http://localhost:4174/";
const APP_PATTERNS = [
  "http://localhost:4174/*",
  "http://127.0.0.1:4174/*",
];

function createSelectionMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: OPEN_MENU_ID,
      title: chrome.i18n.getMessage("contextMenu"),
      contexts: ["selection"],
    });
    chrome.contextMenus.create({
      id: QUESTION_MENU_ID,
      title: chrome.i18n.getMessage("questionMenu"),
      contexts: ["selection"],
      documentUrlPatterns: APP_PATTERNS,
    });
  });
}

chrome.runtime.onInstalled.addListener(createSelectionMenus);
chrome.runtime.onStartup.addListener(createSelectionMenus);

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const selectedText = String(info.selectionText || "").trim();
  if (!selectedText) return;

  if (info.menuItemId === OPEN_MENU_ID) {
    // Put the text in the URL fragment rather than the query string. Fragments are
    // handled entirely in the browser and are not sent to the local Node server.
    const url = `${APP_URL}#ac_text=${encodeURIComponent(selectedText)}`;
    chrome.tabs.create({ url });
    return;
  }

  if (info.menuItemId === QUESTION_MENU_ID && Number.isInteger(tab?.id)) {
    chrome.tabs.sendMessage(tab.id, {
      type: "question",
      selectedText,
    }, () => {
      // Ignore the expected error if the local app was reloaded before the
      // extension's content script was ready; the user can simply retry.
      void chrome.runtime.lastError;
    });
  }
});
