(function installReasonSelectionClient(root) {
  if (!root?.document || !root.REASON_SELECTION) return;

  const engine = root.REASON_SELECTION;
  ensureLevelCheckboxes();
  const levelInputs = () => [...root.document.querySelectorAll('[data-level-checkbox]')];
  const innerFetch = root.fetch.bind(root);
  let lastFullResult = null;
  let lastDisplayResult = null;
  let lastBaseKey = "";
  let forceNextAnalysis = false;

  installUiText();
  restoreCheckboxes();
  refreshLabels();

  root.fetch = async function reasonSelectionFetch(input, init) {
    let url;
    try {
      url = new URL(typeof input === "string" ? input : input.url, root.location.href);
    } catch {
      return innerFetch(input, init);
    }

    const method = String(init?.method || (typeof input !== "string" ? input.method : "GET") || "GET").toUpperCase();
    if (method !== "POST" || url.pathname !== "/api/annotate" || typeof init?.body !== "string") {
      return innerFetch(input, init);
    }

    let payload;
    try {
      payload = JSON.parse(init.body);
    } catch {
      return innerFetch(input, init);
    }

    const levels = selectedLevels();
    const density = Number(payload.density || root.document.getElementById("densityRange")?.value || 2);
    const serverPayload = {
      ...payload,
      level: "beginner",
      levels,
    };
    const baseKey = analysisBaseKey(serverPayload);

    if (!forceNextAnalysis && lastFullResult && lastBaseKey === baseKey) {
      const displayed = transformResult(lastFullResult, levels, density, { localReasonCache: true });
      rememberDisplayed(displayed);
      scheduleUiRefresh();
      return new Response(JSON.stringify(displayed), {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }

    const shouldForce = forceNextAnalysis;
    forceNextAnalysis = false;
    const requestInit = {
      ...init,
      body: JSON.stringify(serverPayload),
    };
    const response = await innerFetch(input, requestInit);
    if (!response.ok) return response;

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/x-ndjson") && response.body && typeof TransformStream !== "undefined") {
      return transformNdjsonResponse(response, levels, density, baseKey);
    }
    if (contentType.includes("application/json")) {
      try {
        const full = await response.json();
        lastFullResult = cloneJson(full);
        lastBaseKey = baseKey;
        const displayed = transformResult(full, levels, density, { forced: shouldForce });
        rememberDisplayed(displayed);
        scheduleUiRefresh();
        return jsonResponseLike(response, displayed);
      } catch {
        return response;
      }
    }
    return response;
  };

  for (const input of levelInputs()) {
    input.addEventListener("change", (event) => {
      const checked = levelInputs().filter((item) => item.checked);
      if (!checked.length) event.target.checked = true;
      persistLevels();
      refreshSelectedLevelStat();
      requestLocalRedisplay();
    });
  }

  root.document.getElementById("densityRange")?.addEventListener("change", requestLocalRedisplay);
  root.document.getElementById("reanalyzeBtn")?.addEventListener("click", () => {
    forceNextAnalysis = true;
  }, { capture: true });
  root.document.getElementById("uiLangSelect")?.addEventListener("change", () => {
    root.setTimeout(() => {
      refreshLabels();
      refreshReasonBadges();
    }, 0);
  });

  root.document.getElementById("copyJsonBtn")?.addEventListener("click", async (event) => {
    if (!lastDisplayResult) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const text = JSON.stringify(lastDisplayResult, null, 2);
    const output = root.document.getElementById("exportText");
    if (output) output.value = text;
    try { await root.navigator.clipboard.writeText(text); } catch { /* optional */ }
    if (typeof root.setStatus === "function") root.setStatus(ui("jsonCopied", "JSON copied"), "ok");
  }, { capture: true });

  root.document.getElementById("copyMarkdownBtn")?.addEventListener("click", async (event) => {
    if (!lastDisplayResult) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const text = markdownFor(lastDisplayResult);
    const output = root.document.getElementById("exportText");
    if (output) output.value = text;
    try { await root.navigator.clipboard.writeText(text); } catch { /* optional */ }
    if (typeof root.setStatus === "function") root.setStatus(ui("markdownCopied", "Markdown copied"), "ok");
  }, { capture: true });

  const wordList = root.document.getElementById("wordList");
  const overlay = root.document.getElementById("overlay");
  const observer = new MutationObserver(() => {
    refreshReasonBadges();
    refreshSelectedLevelStat();
  });
  if (wordList) observer.observe(wordList, { childList: true, subtree: true });
  if (overlay) observer.observe(overlay, { attributes: true, attributeFilter: ["class"] });

  const busyObserver = new MutationObserver(() => {
    const busy = root.document.getElementById("annotateBtn")?.disabled === true;
    levelInputs().forEach((input) => { input.disabled = busy; });
  });
  const analyzeButton = root.document.getElementById("annotateBtn");
  if (analyzeButton) busyObserver.observe(analyzeButton, { attributes: true, attributeFilter: ["disabled"] });

  root.addEventListener("annotator:analysis-result", (event) => {
    if (!event.detail) return;
    if (!lastFullResult) lastFullResult = cloneJson(event.detail);
    scheduleUiRefresh();
  });

  refreshSelectedLevelStat();

  function ensureLevelCheckboxes() {
    if (root.document.querySelector('[data-level-checkbox]')) return;
    const levelButtons = [...root.document.querySelectorAll('.segment[data-level]')];
    if (!levelButtons.length) return;
    const host = levelButtons[0].parentElement;
    if (!host) return;
    host.className = "level-checkboxes";
    host.setAttribute("role", "group");
    host.setAttribute("aria-label", "Target difficulty bands");
    host.innerHTML = "";
    for (const level of ["beginner", "intermediate", "advanced"]) {
      const label = root.document.createElement("label");
      label.className = "level-checkbox";
      const input = root.document.createElement("input");
      input.type = "checkbox";
      input.value = level;
      input.dataset.levelCheckbox = "";
      const span = root.document.createElement("span");
      span.dataset.i18n = level;
      span.textContent = level;
      label.append(input, span);
      host.appendChild(label);
    }
  }

  function installUiText() {
    root.UI_TEXT = root.UI_TEXT || {};
    root.UI_TEXT.ja = {
      ...(root.UI_TEXT.ja || {}),
      beginner: "初級",
      reasonHardWord: "難語",
      reasonIdiomatic: "慣用表現",
      reasonTerm: "術語",
      reasonConstruction: "構文",
    };
    root.UI_TEXT.en = {
      ...(root.UI_TEXT.en || {}),
      reasonHardWord: "Difficult word",
      reasonIdiomatic: "Idiomatic expression",
      reasonTerm: "Technical term",
      reasonConstruction: "Construction",
    };
  }

  function restoreCheckboxes() {
    const levels = readSavedLevels();
    for (const input of levelInputs()) input.checked = levels.includes(input.value);
  }

  function readSavedLevels() {
    try {
      const parsed = JSON.parse(root.localStorage.getItem("annotation.levels") || "null");
      return engine.normalizeSelectedLevels(parsed || ["intermediate"]);
    } catch {
      return ["intermediate"];
    }
  }

  function selectedLevels() {
    return engine.normalizeSelectedLevels(levelInputs().filter((input) => input.checked).map((input) => input.value));
  }

  function persistLevels() {
    root.localStorage.setItem("annotation.levels", JSON.stringify(selectedLevels()));
    root.localStorage.setItem("annotation.level", "beginner");
  }

  function requestLocalRedisplay() {
    if (!lastFullResult) return;
    const button = root.document.getElementById("annotateBtn");
    if (button && !button.disabled) button.click();
  }

  function transformResult(full, levels, density, flags = {}) {
    const copy = cloneJson(full);
    const candidatePool = Array.isArray(copy?._selection?.candidates)
      ? copy._selection.candidates
      : (Array.isArray(copy.annotations) ? copy.annotations : []);
    const preparedPool = candidatePool.map((candidate) => engine.prepareCandidate(candidate, levels));
    copy.annotations = engine.selectAnnotationsByDensity(preparedPool, density, levels)
      .map(engine.stripInternalSelectionFields);
    copy._selection = {
      ...(copy._selection || {}),
      candidates: preparedPool,
    };
    copy.levels = levels;
    copy.level = levels.length === 1 ? levels[0] : "multiple";
    copy._api = {
      ...(copy._api || {}),
      density: densityName(density),
      selectedLevels: levels,
      candidateCount: preparedPool.length,
      displayedAnnotationCount: copy.annotations.length,
      reasonTaggedSelection: true,
      ...flags,
    };
    return copy;
  }

  function analysisBaseKey(payload) {
    return JSON.stringify({
      text: String(payload.text || ""),
      sourceLanguage: payload.sourceLanguage || "auto",
      explanationLanguage: payload.explanationLanguage || "ja",
      analysisMode: payload.analysisMode === "precise" ? "precise" : "standard",
      focus: payload.focus || "all",
      includeGrammar: payload.includeGrammar !== false,
      includeSlash: payload.includeSlash !== false,
    });
  }

  function transformNdjsonResponse(response, levels, density, baseKey) {
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    let pending = "";
    const transformer = new TransformStream({
      transform(chunk, controller) {
        pending += decoder.decode(chunk, { stream: true });
        const lines = pending.split("\n");
        pending = lines.pop() || "";
        for (const line of lines) controller.enqueue(encoder.encode(transformNdjsonLine(line, levels, density, baseKey) + "\n"));
      },
      flush(controller) {
        pending += decoder.decode();
        if (pending) controller.enqueue(encoder.encode(transformNdjsonLine(pending, levels, density, baseKey)));
      },
    });
    const headers = new Headers(response.headers);
    headers.delete("content-length");
    return new Response(response.body.pipeThrough(transformer), {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  function transformNdjsonLine(line, levels, density, baseKey) {
    if (!line.trim()) return line;
    try {
      const event = JSON.parse(line);
      if (event.type === "result" && event.result) {
        lastFullResult = cloneJson(event.result);
        lastBaseKey = baseKey;
        event.result = transformResult(event.result, levels, density);
        rememberDisplayed(event.result);
        scheduleUiRefresh();
      }
      return JSON.stringify(event);
    } catch {
      return line;
    }
  }

  function rememberDisplayed(result) {
    lastDisplayResult = cloneJson(result);
  }

  function refreshReasonBadges() {
    if (!lastDisplayResult) return;
    const byText = new Map();
    for (const item of lastDisplayResult.annotations || []) {
      const list = byText.get(item.text) || [];
      list.push(item);
      byText.set(item.text, list);
    }

    for (const card of root.document.querySelectorAll("#wordList .word-card:not(.nuance-card)")) {
      const head = card.querySelector(".word-card-head");
      const title = card.querySelector("h3")?.textContent || "";
      const annotation = byText.get(title)?.[0];
      if (!head || !annotation) continue;
      const signature = tagSignature(annotation.reasonTags || []);
      const existing = head.querySelector(".reason-badge-group");
      if (existing?.dataset.signature === signature) continue;
      existing?.remove();
      const group = renderTagGroup(annotation.reasonTags || []);
      group.dataset.signature = signature;
      if (group.childElementCount) head.appendChild(group);
    }

    const popupType = root.document.getElementById("popupType");
    const popupWord = root.document.getElementById("popupWord")?.textContent || "";
    const existingPopup = root.document.getElementById("popupReasonTags");
    if (popupType && !popupType.hidden) {
      const annotation = byText.get(popupWord)?.[0];
      if (annotation) {
        const signature = tagSignature(annotation.reasonTags || []);
        if (existingPopup?.dataset.signature === signature) return;
        existingPopup?.remove();
        const group = renderTagGroup(annotation.reasonTags || []);
        group.id = "popupReasonTags";
        group.dataset.signature = signature;
        if (group.childElementCount) popupType.insertAdjacentElement("afterend", group);
        return;
      }
    }
    existingPopup?.remove();
  }

  function renderTagGroup(tags) {
    const group = root.document.createElement("span");
    group.className = "reason-badge-group";
    for (const tag of tags) {
      const badge = root.document.createElement("span");
      badge.className = `reason-tag ${tagClass(tag)}`;
      badge.textContent = translatedTag(tag);
      group.appendChild(badge);
    }
    return group;
  }

  function tagSignature(tags) {
    const language = root.document.getElementById("uiLangSelect")?.value || "ja";
    return `${language}:${tags.join("|")}`;
  }

  function translatedTag(tag) {
    const key = {
      "難語": "reasonHardWord",
      "慣用表現": "reasonIdiomatic",
      "術語": "reasonTerm",
      "構文": "reasonConstruction",
    }[tag];
    return key ? ui(key, tag) : tag;
  }

  function tagClass(tag) {
    return {
      "難語": "reason-hard-word",
      "慣用表現": "reason-idiomatic",
      "術語": "reason-term",
      "構文": "reason-construction",
    }[tag] || "reason-other";
  }

  function refreshSelectedLevelStat() {
    const stat = root.document.getElementById("statLevel");
    if (!stat) return;
    stat.textContent = selectedLevels().map((level) => ui(level, level)).join("・");
  }

  function refreshLabels() {
    for (const input of levelInputs()) {
      const span = input.closest("label")?.querySelector("span");
      if (span) span.textContent = ui(input.value, input.value);
    }
    refreshSelectedLevelStat();
  }

  function ui(key, fallback) {
    if (typeof root.t === "function") {
      const value = root.t(key);
      if (value && value !== key) return value;
    }
    const code = root.document.getElementById("uiLangSelect")?.value || "ja";
    return root.UI_TEXT?.[code]?.[key] || root.UI_TEXT?.en?.[key] || root.UI_TEXT?.ja?.[key] || fallback || key;
  }

  function scheduleUiRefresh() {
    root.setTimeout(() => {
      refreshReasonBadges();
      refreshSelectedLevelStat();
    }, 0);
    root.setTimeout(refreshReasonBadges, 60);
  }

  function markdownFor(result) {
    const lines = [
      "# Language Annotation",
      "",
      "## Text",
      result.sourceText || "",
      "",
      `Levels: ${(result.levels || selectedLevels()).join(", ")}`,
      "",
      "## Translation",
      result.translation || "",
      "",
      "## Annotations",
      ...(result.annotations || []).map((item) => {
        const tags = (item.reasonTags || []).map((tag) => `[${tag}]`).join("");
        const type = item.type ? ` (${item.type})` : "";
        return `- **${item.text}** ${tags}${type}: ${item.meaningJa || ""}${item.noteJa ? ` / ${item.noteJa}` : ""}`;
      }),
      "",
      "## Connotations",
      ...(result.connotations || []).map((item) => `- **${item.text}** (${[item.category, ...(item.secondaryCategories || [])].filter(Boolean).join(" / ")}): ${item.suggestedMeaning || ""}`),
    ];
    return lines.join("\n");
  }

  function densityName(density) {
    return Number(density) <= 1 ? "low" : Number(density) >= 3 ? "high" : "standard";
  }

  function cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function jsonResponseLike(original, data) {
    const headers = new Headers(original.headers);
    headers.delete("content-length");
    headers.set("content-type", "application/json; charset=utf-8");
    return new Response(JSON.stringify(data), {
      status: original.status,
      statusText: original.statusText,
      headers,
    });
  }
}(typeof globalThis !== "undefined" ? globalThis : window));
