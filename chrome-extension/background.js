const MENU_ID = "open-in-annotator-connotator";
const APP_URL = "http://localhost:4174/";

function createSelectionMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: chrome.i18n.getMessage("contextMenu"),
      contexts: ["selection"],
    });
  });
}

chrome.runtime.onInstalled.addListener(createSelectionMenu);

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId !== MENU_ID) return;
  const selectedText = String(info.selectionText || "").trim();
  if (!selectedText) return;

  // Put the text in the URL fragment rather than the query string. Fragments are
  // handled entirely in the browser and are not sent to the local Node server.
  const url = `${APP_URL}#ac_text=${encodeURIComponent(selectedText)}`;
  chrome.tabs.create({ url });
});
