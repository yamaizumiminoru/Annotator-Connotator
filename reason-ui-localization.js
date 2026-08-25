(function initReasonUiLocalization(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root?.document) api.install(root);
}(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const UI_TEXT_CACHE_VERSION = "5";
  const JAPANESE_APP_TITLE = "あの手ーターこの手ーター";
  const REASON_BADGES = {
    "reason-hard-word": "reasonHardWord",
    "reason-idiomatic": "reasonIdiomatic",
    "reason-term": "reasonTerm",
    "reason-construction": "reasonConstruction",
  };

  function cacheKey(language, version = UI_TEXT_CACHE_VERSION) {
    return `annotation.uiText.${version}.${language}`;
  }

  function readCache(storage, language, version = UI_TEXT_CACHE_VERSION) {
    try {
      const value = JSON.parse(storage.getItem(cacheKey(language, version)) || "null");
      return value && typeof value === "object" ? value : null;
    } catch {
      return null;
    }
  }

  function missingUiStrings(baseStrings, cachedStrings) {
    const base = baseStrings && typeof baseStrings === "object" ? baseStrings : {};
    const cached = cachedStrings && typeof cachedStrings === "object" ? cachedStrings : {};
    return Object.fromEntries(
      Object.entries(base).filter(([key]) => !Object.hasOwn(cached, key)),
    );
  }

  function mergeUiStrings(cachedStrings, translatedStrings) {
    return {
      ...(cachedStrings && typeof cachedStrings === "object" ? cachedStrings : {}),
      ...(translatedStrings && typeof translatedStrings === "object" ? translatedStrings : {}),
    };
  }

  function interpolate(text, values = {}) {
    let output = String(text ?? "");
    for (const [name, value] of Object.entries(values || {})) {
      output = output.replaceAll(`{${name}}`, String(value));
    }
    return output;
  }

  function install(root) {
    if (root.__reasonUiLocalizationInstalled) return;
    root.__reasonUiLocalizationInstalled = true;

    if (root.UI_TEXT && root.UI_TEXT.ja) {
      root.UI_TEXT.ja.appTitle = JAPANESE_APP_TITLE;
    }

    const select = root.document.getElementById("uiLangSelect");
    const originalT = typeof root.t === "function" ? root.t : null;
    const inFlight = new Map();

    function currentLanguage() {
      return select?.value || root.localStorage.getItem("annotation.uiLanguage") || "ja";
    }

    function translatedValue(language, key) {
      const direct = root.UI_TEXT?.[language]?.[key];
      if (typeof direct === "string") return direct;
      const cached = readCache(root.localStorage, language);
      return typeof cached?.[key] === "string" ? cached[key] : null;
    }

    root.t = function supplementedUiText(key, values = {}) {
      const translated = translatedValue(currentLanguage(), key);
      if (translated != null) return interpolate(translated, values);
      if (originalT) return originalT(key, values);
      const fallback = root.UI_TEXT?.en?.[key] || root.UI_TEXT?.ja?.[key] || key;
      return interpolate(fallback, values);
    };

    if (currentLanguage() === "ja") {
      const appTitle = root.document.querySelector('[data-i18n="appTitle"]');
      if (appTitle) appTitle.textContent = JAPANESE_APP_TITLE;
    }

    function relocalizeReasonBadges() {
      for (const [className, key] of Object.entries(REASON_BADGES)) {
        for (const badge of root.document.querySelectorAll(`.reason-tag.${className}`)) {
          badge.textContent = root.t(key);
        }
      }
    }

    async function supplementCachedLanguage(language = currentLanguage()) {
      if (!language || language === "ja" || language === "en") {
        relocalizeReasonBadges();
        return false;
      }
      const cached = readCache(root.localStorage, language);
      if (!cached) return false;
      const missing = missingUiStrings(root.UI_TEXT?.en || root.UI_TEXT?.ja || {}, cached);
      if (!Object.keys(missing).length) {
        relocalizeReasonBadges();
        return false;
      }
      if (inFlight.has(language)) return inFlight.get(language);

      const task = (async () => {
        try {
          const response = await root.fetch("/api/ui-translations", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ language, strings: missing }),
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok || !data.strings || typeof data.strings !== "object") return false;
          const merged = mergeUiStrings(cached, data.strings);
          root.localStorage.setItem(cacheKey(language), JSON.stringify(merged));

          // Re-run the app's existing language-change handler so its private state.uiText
          // picks up the supplemented cache rather than falling back to English.
          select?.dispatchEvent(new Event("change"));
          root.setTimeout(relocalizeReasonBadges, 0);
          return true;
        } catch {
          return false;
        } finally {
          inFlight.delete(language);
        }
      })();
      inFlight.set(language, task);
      return task;
    }

    select?.addEventListener("change", () => {
      root.setTimeout(() => {
        relocalizeReasonBadges();
        supplementCachedLanguage(currentLanguage());
      }, 0);
    });

    relocalizeReasonBadges();
    root.setTimeout(() => supplementCachedLanguage(currentLanguage()), 0);

    root.REASON_UI_LOCALIZATION = {
      ...(root.REASON_UI_LOCALIZATION || {}),
      supplementCachedLanguage,
    };
  }

  return {
    UI_TEXT_CACHE_VERSION,
    JAPANESE_APP_TITLE,
    cacheKey,
    install,
    interpolate,
    mergeUiStrings,
    missingUiStrings,
    readCache,
  };
}));
