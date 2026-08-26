const MESSAGE_SOURCE = "annotator-connotator-extension";

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== "question") return;
  const selectedText = String(message.selectedText || "");
  if (!selectedText.trim()) return;

  window.postMessage({
    source: MESSAGE_SOURCE,
    type: "question",
    selectedText,
  }, window.location.origin);
});
