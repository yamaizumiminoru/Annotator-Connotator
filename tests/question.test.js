const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  CONTEXT_TOOL,
  answerQuestion,
  buildContextWindow,
  buildInitialQuestionInput,
  resolveSelectionRange,
} = require("../lib/question-server");
const questionClient = require("../question-client");
const { isCostIncurringRequest } = require("../lib/server-security");

const root = path.join(__dirname, "..");

test("selection range uses exact offsets and falls back to the nearest duplicate", () => {
  const source = "alpha target beta target gamma";
  assert.deepEqual(resolveSelectionRange(source, "target", 6, 12), { start: 6, end: 12 });
  assert.deepEqual(resolveSelectionRange(source, "target", 20, 26), { start: 18, end: 24 });
  assert.equal(resolveSelectionRange(source, "missing", 0, 7), null);
});

test("context windows expose only the requested neighborhood around the selection", () => {
  const source = "0123456789SELECTEDabcdefghij";
  const range = { start: 10, end: 18 };
  const context = buildContextWindow(source, range, 4, 5);
  assert.equal(context.before, "6789");
  assert.equal(context.selected, "SELECTED");
  assert.equal(context.after, "abcde");
  assert.equal(context.reachedStart, false);
  assert.equal(context.reachedEnd, false);
});

test("initial question input contains the selection and question but not the full source", () => {
  const input = buildInitialQuestionInput({ selectedText: "selected phrase", question: "Why this tense?" });
  assert.match(input, /selected phrase/);
  assert.match(input, /Why this tense\?/);
  assert.doesNotMatch(input, /surrounding source/);
  assert.equal(CONTEXT_TOOL.name, "get_context");
  assert.equal(CONTEXT_TOOL.strict, true);
});

test("question flow lets the model request context before answering", async () => {
  const sourceText = "FAR_LEFT_IGNORED xx before SELECTED after yy FAR_RIGHT_IGNORED";
  const selectedText = "SELECTED";
  const selectedStart = sourceText.indexOf(selectedText);
  const selectedEnd = selectedStart + selectedText.length;
  const requestBodies = [];
  const queuedResponses = [
    {
      id: "resp_1",
      output: [{
        type: "function_call",
        name: "get_context",
        call_id: "call_1",
        arguments: JSON.stringify({ before_chars: 7, after_chars: 6 }),
      }],
      usage: { input_tokens: 100, output_tokens: 10, total_tokens: 110 },
    },
    {
      id: "resp_2",
      output_text: "Context-aware answer",
      output: [],
      usage: { input_tokens: 80, output_tokens: 20, total_tokens: 100 },
    },
  ];

  const fetchImpl = async (_url, options) => {
    requestBodies.push(JSON.parse(options.body));
    const data = queuedResponses.shift();
    return {
      ok: true,
      json: async () => data,
      text: async () => "",
    };
  };

  const result = await answerQuestion({
    sourceText,
    selectedText,
    selectedStart,
    selectedEnd,
    question: "What does this mean here?",
    explanationLanguage: "en",
    analysisMode: "standard",
  }, { apiKey: "test-key", fetchImpl });

  assert.equal(result.answer, "Context-aware answer");
  assert.equal(result.contextRequests, 1);
  assert.equal(requestBodies.length, 2);
  assert.match(requestBodies[0].input, /SELECTED/);
  assert.match(requestBodies[0].input, /What does this mean here\?/);
  assert.doesNotMatch(requestBodies[0].input, /FAR_LEFT_IGNORED/);
  assert.doesNotMatch(requestBodies[0].input, /FAR_RIGHT_IGNORED/);
  assert.equal(requestBodies[1].previous_response_id, "resp_1");
  const toolOutput = JSON.parse(requestBodies[1].input[0].output);
  assert.equal(toolOutput.selected, "SELECTED");
  assert.equal(toolOutput.before, " before");
  assert.equal(toolOutput.after, " after");
  assert.equal(result.usage.totalTokens, 210);
});

test("question client maps annotated selections to the nearest source occurrence", () => {
  const source = "same one same two";
  assert.deepEqual(questionClient.resolveOffsets(source, "same", 10), { start: 9, end: 13 });
});

test("question UI is explicit-only, supports a custom context menu and optional voice input", () => {
  const client = fs.readFileSync(path.join(root, "question-client.js"), "utf8");
  const bootstrap = fs.readFileSync(path.join(root, "client-analysis.js"), "utf8");
  const entry = fs.readFileSync(path.join(root, "server-tts.js"), "utf8");
  assert.match(client, /addEventListener\("contextmenu"/);
  assert.match(client, /event\.preventDefault\(\)/);
  assert.match(client, /ENDPOINT = "\/api\/question"/);
  assert.match(client, /SpeechRecognition \|\| root\.webkitSpeechRecognition/);
  assert.match(client, /submitButton\.addEventListener\("click", submitQuestion\)/);
  assert.doesNotMatch(client, /addEventListener\("load"[\s\S]{0,300}\/api\/question/);
  assert.match(bootstrap, /question-client\.js/);
  assert.match(entry, /installQuestionServerPatch/);
  assert.equal(isCostIncurringRequest("POST", "/api/question"), true);
});
