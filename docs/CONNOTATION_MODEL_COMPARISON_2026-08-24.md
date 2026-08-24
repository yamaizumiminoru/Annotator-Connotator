# コノテーション解析モデル比較（2026-08-24）

## 結論

- 通常解析は`gpt-5.6-luna`、精密解析は`gpt-5.6-sol`とする。
- Lunaは日本語・英語32例で9.94/10、重大エラー0件、negative control誤検出0件だった。
- Solは最高精度を保つが、Lunaは短文解析の中央値が約39%短く、費用は約14分の1だった。
- 長い実文章は、日本語・英語・中国語・韓国語・スペイン語・トルコ語・アラビア語で合格を確認した。

## ハイライト範囲

`text/start/end`を学習者が注目する最小のアンカー、`scope`を語用的効果が及ぶ範囲、`contextNote/evidence`を成立条件や対比として分離した。

| モデル | 完全一致（修正前→後） | 想定対象の2倍超（修正前→後） | 修正後品質 |
|---|---:|---:|---:|
| Sol | 48% → 64% | 16% → 0% | 10.00/10 |
| Terra | 20% → 68% | 44% → 0% | 9.88/10 |
| Luna | 40% → 68% | 40% → 0% | 9.94/10 |

狭いハイライトは、その語句だけにニュアンスが語彙的に符号化されているという主張ではない。例えば`子供っぽい`をハイライトしつつ、肯定的な読みは後続する`むしろ`と`魅力だ`の対比によって成立すると説明する。

## 速度と費用

32件の発見テストで、アプリ本体の応答時間だけを測定した。

| モデル | 中央値 | 平均 | アプリ費用 |
|---|---:|---:|---:|
| Sol | 16.55秒 | 16.56秒 | $0.679 |
| Terra | 9.24秒 | 9.11秒 | $0.328 |
| Luna | 10.08秒 | 10.33秒 | $0.048 |

価格は2026-08-24時点のOpenAI公式API価格を使用した。

## 長文・多言語試験

公式機関の記事とユーザー提供文から、7言語の長文を使用した。評価項目は、全文処理、自然で忠実な日本語訳、上級者向け注釈、ニュアンスの正確さ、ハイライトと文脈の分離である。採点はSolに固定した。

最初の一括試験は6/7件合格した。アラビア語では、日本語訳への第三言語1語の混入と、モデルが返した原文の1語欠落が見つかった。次を修正した後、アラビア語も18/20で合格した。

- 入力原文をサーバー側の正本として固定する。
- 日本語訳に不自然な文字体系が混入した場合だけ訳文を自動修復する。
- 原文上で正確に表示できない通常注釈を除去する。
- 抽出量を増やしても難易度の下限を下げないよう指示を強化する。

テスト資料:

- Japanese: user-provided original sample
- English: https://www.unesco.org/en/articles/multilingual-education-key-quality-and-inclusive-learning
- Chinese: https://www.unesco.org/zh/articles/muyu-ningjudeliliang
- Korean: https://www.korea.net/NewsFocus/Culture/view?articleId=296864&koreanId=295372
- Spanish: https://www.unesco.org/es/articles/lengua-materna-pilar-de-la-inclusion
- Turkish: https://www.kulturportali.gov.tr/portal/turkler-ve-turkce
- Arabic: https://www.unesco.org/ar/articles/alywnskw-thtfy-btrath-allght-alrbyt-wtslt-aldw-ly-dwrha-fy-rsm-mlamh-almarf-aljdydt

## 実装

- 通常: `OPENAI_STANDARD_MODEL=gpt-5.6-luna`
- 精密: `OPENAI_PRECISE_MODEL=gpt-5.6-sol`
- UIの「解析モード」で選択し、任意のモデル名はブラウザから指定できない。
- YouTube文字起こし補正、UI翻訳、その他の通常処理はLunaを使用する。

## 注意点

- 母語話者による認証ではなくAI採点によるスクリーニングである。
- 71言語すべてに長文試験を行ったわけではなく、系統と文字体系の異なる7言語を代表として選んだ。
- モデル出力には確率的な揺れがある。精密モードは難しい文章や結果に疑問がある場合の再解析手段として残す。
