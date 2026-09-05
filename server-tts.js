const { installQuestionServerPatch } = require("./lib/question-server");
const { installTtsServerPatch } = require("./lib/tts-server");

installQuestionServerPatch();
installTtsServerPatch();
require("./server-note-policy");
require("./server-source-formatting");
require("./server-advanced-recall");
require("./server-reason-selection");
