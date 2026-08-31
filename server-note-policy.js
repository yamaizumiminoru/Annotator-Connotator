const nativeFetch = global.fetch.bind(global);

global.fetch = async function notePolicyFetch(input, init = {}) {
  const url = typeof input === "string" ? input : String(input?.url || input || "");
  if (!url.startsWith("https://api.openai.com/v1/responses") || typeof init.body !== "string") {
    return nativeFetch(input, init);
  }

  let body;
  try {
    body = JSON.parse(init.body);
  } catch {
    return nativeFetch(input, init);
  }

  const entries = Array.isArray(body?.input) ? body.input : [];
  const system = entries.find((entry) => entry?.role === "system");
  const prompt = String(system?.content || "");
  if (!system || !(
    prompt.includes("multilingual language-learning annotation engine")
    || prompt.includes("completing candidate discovery")
  )) {
    return nativeFetch(input, init);
  }

  const policy = [
    "",
    "Annotation note policy:",
    "- noteJa is optional. An empty string is valid and preferred when no separate explanatory job remains after meaningJa.",
    "- Keep noteJa when it adds useful information not already contained in the gloss: contextual interpretation, usage or register, typical collocation, constructional behavior, contrast, pragmatic implication, or a technical definition.",
    "- Do not fill noteJa merely to restate meaningJa in longer words or to say that the target is an expression, phrase, word, adverb, or compound expression.",
    "- A concise dictionary-style functional explanation can still be useful when it complements rather than duplicates the translation/gloss.",
  ].join("\n");

  const modified = JSON.parse(JSON.stringify(body));
  const modifiedSystem = modified.input.find((entry) => entry?.role === "system");
  modifiedSystem.content = `${String(modifiedSystem.content || "")}\n${policy}`;
  return nativeFetch(input, { ...init, body: JSON.stringify(modified) });
};
