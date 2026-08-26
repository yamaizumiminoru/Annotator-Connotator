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

    root.UI_TEXT = root.UI_TEXT || {};
    root.UI_TEXT.ja = {
      ...(root.UI_TEXT.ja || {}),
      appTitle: JAPANESE_APP_TITLE,
      uiLanguage: "表示言語",
      serverReadyShort: "LLM準備完了",
      serverKeyNeededShort: "キー未設定",
      serverOfflineShort: "オフライン",
    };
    root.UI_TEXT.en = {
      ...(root.UI_TEXT.en || {}),
      uiLanguage: "UI language",
      serverReadyShort: "LLM ready",
      serverKeyNeededShort: "key needed",
      serverOfflineShort: "offline",
    };

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

    function relocalizeReasonBadges() {
      for (const [className, key] of Object.entries(REASON_BADGES)) {
        for (const badge of root.document.querySelectorAll(`.reason-tag.${className}`)) {
          badge.textContent = root.t(key);
        }
      }
    }

    function relocalizeStaticPolish() {
      const appTitle = root.document.querySelector('[data-i18n="appTitle"]');
      if (appTitle) appTitle.textContent = root.t("appTitle");
      const uiLanguageLabel = root.document.querySelector('[data-i18n="uiLanguage"]');
      if (uiLanguageLabel) uiLanguageLabel.textContent = root.t("uiLanguage");
    }

    function relocalizeTtsControls() {
      const deviceButton = root.document.getElementById("speakBtn");
      const aiButton = root.document.getElementById("aiSpeakBtn");
      const voiceSelect = root.document.getElementById("aiVoiceSelect");

      if (deviceButton?.classList.contains("tts-device-btn")) {
        const speaking = deviceButton.dataset.speaking === "true";
        deviceButton.textContent = `${speaking ? "Ⅱ" : "▶"} ${root.t("deviceSpeech")}`;
        deviceButton.title = root.t("deviceSpeechTitle");
        deviceButton.setAttribute("aria-label", deviceButton.title);
      }
      if (aiButton) {
        const speaking = aiButton.dataset.speaking === "true";
        aiButton.textContent = `${speaking ? "■" : "✨"} ${root.t("aiSpeech")}`;
        aiButton.title = root.t("aiSpeechTitle");
        aiButton.setAttribute("aria-label", aiButton.title);
      }
      if (voiceSelect) voiceSelect.setAttribute("aria-label", root.t("aiVoice"));
    }

    function detectServerState(pill) {
      if (!pill) return "";
      if (pill.classList.contains("ready")) return "ready";
      const text = String(pill.textContent || "").trim().toLowerCase();
      if (["offline", "オフライン"].includes(text)) return "offline";
      if (["key needed", "キー未設定"].includes(text)) return "key";
      return pill.dataset.serverState || "";
    }

    function relocalizeServerPill() {
      const pill = root.document.getElementById("serverPill");
      if (!pill) return;
      const detected = detectServerState(pill);
      if (detected) pill.dataset.serverState = detected;
      const state = pill.dataset.serverState;
      const key = state === "ready"
        ? "serverReadyShort"
        : state === "offline"
          ? "serverOfflineShort"
          : state === "key"
            ? "serverKeyNeededShort"
            : null;
      if (!key) return;
      const next = root.t(key);
      if (pill.textContent !== next) pill.textContent = next;
    }

    function relocalizeDynamicUi() {
      relocalizeStaticPolish();
      relocalizeTtsControls();
      relocalizeReasonBadges();
      relocalizeServerPill();
    }

    const serverPill = root.document.getElementById("serverPill");
    if (serverPill && typeof root.MutationObserver === "function") {
      const observer = new root.MutationObserver(() => relocalizeServerPill());
      observer.observe(serverPill, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    }

    async function supplementCachedLanguage(language = currentLanguage()) {
      if (!language || language === "ja" || language === "en") {
        relocalizeDynamicUi();
        return false;
      }
      const cached = readCache(root.localStorage, language);
      if (!cached) {
        relocalizeDynamicUi();
        return false;
      }
      const missing = missingUiStrings(root.UI_TEXT?.en || root.UI_TEXT?.ja || {}, cached);
      if (!Object.keys(missing).length) {
        relocalizeDynamicUi();
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
          root.setTimeout(relocalizeDynamicUi, 0);
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
        relocalizeDynamicUi();
        supplementCachedLanguage(currentLanguage());
      }, 0);
    });

    relocalizeDynamicUi();
    root.setTimeout(() => {
      relocalizeDynamicUi();
      supplementCachedLanguage(currentLanguage());
    }, 0);

    root.REASON_UI_LOCALIZATION = {
      ...(root.REASON_UI_LOCALIZATION || {}),
      relocalizeDynamicUi,
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
