const { installQuestionServerPatch } = require("./lib/question-server");
const { installTtsServerPatch } = require("./lib/tts-server");
const { installAdvancedRecallPatch } = require("./server-advanced-recall");

installQuestionServerPatch();
installTtsServerPatch();
installAdvancedRecallPatch();
require("./server-note-policy");
require("./server-source-formatting");
require("./server-reason-selection");
