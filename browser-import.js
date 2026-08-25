(function initBrowserImport(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root?.document) api.install(root);
}(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const HASH_KEY = "ac_text";

  function importedTextFromHash(hash) {
    const raw = String(hash || "").replace(/^#/, "");
    if (!raw) return "";
    try {
      const params = new URLSearchParams(raw);
      return String(params.get(HASH_KEY) || "");
    } catch {
      return "";
    }
  }

  function install(root) {
    const text = importedTextFromHash(root?.location?.hash);
    if (!text) return false;

    const input = root.document?.getElementById("sourceText");
    if (!input) return false;

    input.value = text;
    if (typeof root.Event === "function") {
      input.dispatchEvent(new root.Event("input", { bubbles: true }));
      input.dispatchEvent(new root.Event("change", { bubbles: true }));
    }

    // Remove the imported text from the visible URL after it has been handed to the app.
    // The fragment never reaches the local server, so selected text is not placed in server logs.
    if (typeof root.history?.replaceState === "function") {
      root.history.replaceState(null, "", `${root.location.pathname || "/"}${root.location.search || ""}`);
    }

    if (typeof root.setTimeout === "function") {
      root.setTimeout(() => input.focus?.(), 0);
    } else {
      input.focus?.();
    }
    return true;
  }

  return { HASH_KEY, importedTextFromHash, install };
}));
