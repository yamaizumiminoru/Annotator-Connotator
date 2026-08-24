import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const benchmarkRoot = path.join(root, "tmp", "benchmarks");
const models = ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"];
const runDirs = fs.readdirSync(benchmarkRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(benchmarkRoot, entry.name, "comparison.json")))
  .filter((entry) => {
    const comparison = readJson(path.join(benchmarkRoot, entry.name, "comparison.json"));
    return models.every((model) => Number(comparison.models?.[model]?.summary?.completed || 0) >= 32);
  })
  .map((entry) => path.join(benchmarkRoot, entry.name))
  .sort((a, b) => fs.statSync(path.join(b, "comparison.json")).mtimeMs - fs.statSync(path.join(a, "comparison.json")).mtimeMs);

if (runDirs.length < 2) throw new Error("Two completed comparison runs are required.");

const [latestDir, previousDir] = runDirs;
const latestComparison = readJson(path.join(latestDir, "comparison.json"));
const previousComparison = readJson(path.join(previousDir, "comparison.json"));
const report = {
  generatedAt: new Date().toISOString(),
  latestRun: path.basename(latestDir),
  previousRun: path.basename(previousDir),
  models: {},
  totalExperimentCostUsd: sumComparisonCost(latestComparison) + sumComparisonCost(previousComparison),
};

for (const model of models) {
  const latest = readJson(path.join(latestDir, `${model}.json`));
  const previous = readJson(path.join(previousDir, `${model}.json`));
  const comparisonModel = latestComparison.models[model];
  report.models[model] = {
    quality: {
      discoveryAverage: latest.summary.discovery.average,
      explanationAverage: latest.summary.explanation?.average ?? null,
      structuralFailures: latest.summary.structuralFailures,
      criticalErrors: latest.summary.discovery.criticalErrors
        + Number(latest.summary.explanation?.criticalErrors || 0),
      negativeControlErrors: latest.summary.discovery.negativeControlErrors
        + Number(latest.summary.explanation?.negativeControlErrors || 0),
    },
    selection: selectionMetrics(latest),
    repeatability: repeatabilityMetrics(latest, previous),
    usage: latest.summary.usage.app,
    estimatedAppCostUsd: comparisonModel.estimatedAppCostUsd,
    estimatedCostPerRequestUsd: round(comparisonModel.estimatedAppCostUsd / latest.summary.completed, 6),
    elapsedSeconds: elapsedSeconds(latest, path.join(latestDir, `${model}.json`)),
    nonPerfectCases: latest.records
      .filter((record) => record.mode === "discovery" && Number(record.judgment?.totalScore || 0) < 10)
      .map((record) => ({
        id: record.testCase.id,
        score: record.judgment.totalScore,
        reason: record.judgment.reason,
        issues: record.judgment.issues,
      })),
  };
}

const jsonPath = path.join(latestDir, "selection-comparison.json");
fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
const mdPath = path.join(latestDir, "generated-report.md");
fs.writeFileSync(mdPath, renderMarkdown(report));
console.log(JSON.stringify(report, null, 2));
console.log(`Saved ${jsonPath}`);
console.log(`Saved ${mdPath}`);

function selectionMetrics(result) {
  const discovery = result.records.filter((record) => record.mode === "discovery");
  const positives = discovery.filter((record) => record.testCase.expected.shouldDetect);
  const negatives = discovery.filter((record) => !record.testCase.expected.shouldDetect);
  const positiveDetails = positives.map((record) => {
    const matches = targetMatches(record);
    const targetLength = record.testCase.targetText.length;
    return {
      detected: matches.length > 0,
      exact: matches.some((item) => item.text === record.testCase.targetText),
      acceptablePrimary: matches.some((item) => record.testCase.expected.acceptableCategories.includes(item.category)),
      wide: matches.length > 0 && Math.min(...matches.map((item) => item.text.length)) > targetLength * 2,
    };
  });
  return {
    positiveCases: positives.length,
    targetDetectionRate: rate(positiveDetails.filter((item) => item.detected).length, positives.length),
    exactTargetRate: rate(positiveDetails.filter((item) => item.exact).length, positives.length),
    acceptablePrimaryCategoryRate: rate(positiveDetails.filter((item) => item.acceptablePrimary).length, positives.length),
    overlyWideTargetRate: rate(positiveDetails.filter((item) => item.wide).length, positives.length),
    negativeCases: negatives.length,
    negativeAbstentionRate: rate(negatives.filter((record) => record.structure.connotationCount === 0).length, negatives.length),
    averageConnotationsPerCase: round(discovery.reduce((sum, record) => sum + record.structure.connotationCount, 0) / discovery.length, 3),
  };
}

function repeatabilityMetrics(latest, previous) {
  const latestDiscovery = new Map(latest.records.filter((record) => record.mode === "discovery").map((record) => [record.testCase.id, record]));
  const previousDiscovery = new Map(previous.records.filter((record) => record.mode === "discovery").map((record) => [record.testCase.id, record]));
  const ids = [...latestDiscovery.keys()].filter((id) => previousDiscovery.has(id));
  let detectionAgreement = 0;
  let exactAgreement = 0;
  let primaryCategoryAgreement = 0;
  let primaryComparable = 0;
  let jaccardTotal = 0;

  for (const id of ids) {
    const a = latestDiscovery.get(id);
    const b = previousDiscovery.get(id);
    const aMatches = targetMatches(a);
    const bMatches = targetMatches(b);
    if ((aMatches.length > 0) === (bMatches.length > 0)) detectionAgreement += 1;
    const aExact = aMatches.some((item) => item.text === a.testCase.targetText);
    const bExact = bMatches.some((item) => item.text === b.testCase.targetText);
    if (aExact === bExact) exactAgreement += 1;
    if (aMatches.length && bMatches.length) {
      primaryComparable += 1;
      if (shortest(aMatches).category === shortest(bMatches).category) primaryCategoryAgreement += 1;
    }
    const aSet = new Set((a.annotation.connotations || []).map((item) => `${item.text}\u0000${item.category}`));
    const bSet = new Set((b.annotation.connotations || []).map((item) => `${item.text}\u0000${item.category}`));
    jaccardTotal += jaccard(aSet, bSet);
  }

  return {
    cases: ids.length,
    targetDetectionAgreementRate: rate(detectionAgreement, ids.length),
    exactTargetDecisionAgreementRate: rate(exactAgreement, ids.length),
    targetPrimaryCategoryAgreementRate: rate(primaryCategoryAgreement, primaryComparable),
    exactSpanCategoryJaccard: round(jaccardTotal / ids.length, 3),
  };
}

function targetMatches(record) {
  const target = record.testCase.targetText;
  if (!target) return [];
  const start = record.testCase.sourceText.indexOf(target);
  const end = start + target.length;
  return (record.annotation.connotations || []).filter((item) => item.start < end && item.end > start);
}

function shortest(items) {
  return [...items].sort((a, b) => a.text.length - b.text.length)[0];
}

function jaccard(a, b) {
  const union = new Set([...a, ...b]);
  if (!union.size) return 1;
  const intersection = [...a].filter((item) => b.has(item)).length;
  return intersection / union.size;
}

function elapsedSeconds(result, filePath) {
  return Math.round((fs.statSync(filePath).mtimeMs - new Date(result.generatedAt).getTime()) / 1000);
}

function sumComparisonCost(comparison) {
  return Object.values(comparison.models).reduce((sum, item) => (
    sum + Number(item.estimatedAppCostUsd || 0) + Number(item.estimatedJudgeCostUsd || 0)
  ), 0);
}

function renderMarkdown(data) {
  const rows = models.map((model) => {
    const item = data.models[model];
    const explanation = item.quality.explanationAverage == null ? "n/a" : `${item.quality.explanationAverage}/8`;
    return `| ${model} | ${item.quality.discoveryAverage}/10 | ${explanation} | ${pct(item.selection.targetDetectionRate)} | ${pct(item.selection.exactTargetRate)} | ${pct(item.selection.acceptablePrimaryCategoryRate)} | ${pct(item.repeatability.exactSpanCategoryJaccard)} | $${item.estimatedAppCostUsd.toFixed(3)} | ${formatDuration(item.elapsedSeconds)} |`;
  }).join("\n");
  return `# コノテーション解析モデル比較（2026-08-24）\n\n## 結論\n\n- Solを常時使う必要はない。通常解析の第一候補は、今回ほぼ同等の品質を約14分の1の費用で出したLuna。YouTube文字起こしの訂正にもLunaを使える。\n- Solは「どの文字列を注釈するか」の正確さと再現性で最も良く、難しい文章や「詳しめ」の精密モードに残す価値がある。\n- TerraはLunaより速く、出力トークンも少なかったが、今回の品質・文字列選択・費用の組み合わせでは明確な役割を得られなかった。\n- ただし、Lunaを71言語すべての既定モデルにする前に、長い実文章と多様な代表言語で追加検証する。\n\n## 修正版ベンチマーク\n\n32件の発見テストでは、モデル自身が「注釈するか」「どの文字列に注目するか」「何のカテゴリか」を選んだ。25件の説明テストでは、説明力だけを分離して測るため対象文字列のみを与え、正解カテゴリは与えていない。採点モデルは全件GPT-5.6 Sol（reasoning: low）に固定した。\n\n| モデル | 発見品質 | 説明品質 | 対象検出 | 完全一致した文字列 | 主カテゴリ | 2回の文字列・カテゴリ一致 | アプリ費用（57回） | 所要時間 |\n|---|---:|---:|---:|---:|---:|---:|---:|---:|\n${rows}\n\n修正版では、3モデルとも形式エラー0件、重大エラー0件、negative controlの誤検出0件だった。\n\n## 文字列選択の挙動\n\n${models.map((model) => {
    const item = data.models[model];
    return `### ${model}\n\n- 1ケースあたりの平均ニュアンス数: ${item.selection.averageConnotationsPerCase}\n- 想定対象の2倍を超える範囲を選んだ割合: ${pct(item.selection.overlyWideTargetRate)}\n- negative controlで何も出さなかった割合: ${pct(item.selection.negativeAbstentionRate)}\n- 2回の対象検出判断の一致率: ${pct(item.repeatability.targetDetectionAgreementRate)}\n- 2回の主カテゴリ一致率: ${pct(item.repeatability.targetPrimaryCategoryAgreementRate)}\n`;
  }).join("\n")}\n## 費用\n\n修正版のアプリ本体の呼び出しは3モデル合計で約$${sumComparisonCost({ models: Object.fromEntries(models.map((model) => [model, { estimatedAppCostUsd: data.models[model].estimatedAppCostUsd, estimatedJudgeCostUsd: 0 }])) }).toFixed(3)}。最初の試行と修正版の両方、および固定したSol採点モデルを含む実験全体は約$${data.totalExperimentCostUsd.toFixed(3)}だった。価格表: ${latestComparison.pricing.source}\n\n## 注意点\n\n- 対象言語は日本語と英語のみ。\n- 長い実文章ではなく、短く統制した例文を使用。\n- 母語話者による認証ではなく、AI採点によるスクリーニング。\n- 発見テストは2回を比較したが、確率的な揺れをさらに評価するには反復数を増やす必要がある。\n`;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function rate(numerator, denominator) {
  return denominator ? round(numerator / denominator, 4) : null;
}

function round(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function pct(value) {
  return value == null ? "n/a" : `${(value * 100).toFixed(1)}%`;
}

function formatDuration(seconds) {
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}
