# Language quality evaluation

Date: 2026-08-21

Model: `gpt-5.6-sol`

## Method

The evaluation had two stages. First, twenty languages not present in the original 57-language catalog were screened as candidates. Second, all 57 original catalog languages were re-evaluated with the same method. Each language received two generated source passages: an informational passage testing translation and moderately complex grammar, and a pragmatic passage testing an idiom, stance marker, politeness choice, register, or implication.

Every passage was sent through the app's real `/api/annotate` endpoint with English explanations. A separate GPT-5.6 request scored source naturalness, translation faithfulness, annotation accuracy, learning usefulness, and connotation/register handling from 0 to 4. The app also verified that every annotation could be located and rendered in the source text.

Languages that passed both source passages were then tested as explanation languages. The app translated and explained a common English passage containing a polite but discouraging implication. A separate GPT-5.6 request scored output-language naturalness, translation faithfulness, explanation accuracy, and connotation handling.

A language remained selectable only when both source passages and the explanation-language case passed. This is an AI-only screening test, not native-speaker certification.

## Concrete test examples

The source-language cases were generated separately in each target language. The following Japanese examples show the kind of passage and feature that the evaluator requested; they are illustrations of the test design rather than one shared translated test sentence.

### Informational source-language case

> 市立図書館は、仕事の後でも学生が勉強できるよう、開館時間を延長した。この変更は歓迎されたが、夜間にもっと静かな場所を求める住民もいた。

This type of case checked whether the app could preserve the full meaning while explaining a conditional, relative clause, concession, complement clause, or another moderately complex construction. The evaluator checked the full translation, every annotation meaning and note, example usage, and the source-text span used for highlighting.

### Pragmatic source-language case

> 委員会は「検討しておきます」と丁寧に答えたが、その言い方には、実際には何もしない可能性が高いという含みがあった。

This type of case included an idiom, stance marker, politeness choice, register difference, or implication. A merely literal translation was insufficient: the annotation also had to explain what the speaker was suggesting and how the expression would normally be interpreted.

### Explanation-language case

Every source-language pass was then tested as an explanation language with the same English passage:

> The committee's reply was technically polite, but the phrase “we will keep it in mind” gently suggested that no action was likely.

The requested language had to be used naturally in the full translation, summary, annotation meanings, and usage notes. The explanation also had to state that “we will keep it in mind” was polite on the surface but pragmatically discouraged an expectation of action.

### Passing threshold

For each source-language case, GPT-5.6 scored source naturalness, translation faithfulness, annotation accuracy, learning usefulness, and connotation/register handling from 0 to 4. A case needed at least 16/20, with no critical error and minimum scores in every required dimension. Both source cases had to pass. The explanation-language case was scored separately for output-language naturalness, translation faithfulness, explanation accuracy, and connotation handling; it needed at least 13/16 with no critical error.

## Candidate results

| Code | Language | Average / 20 | Result |
| --- | --- | ---: | --- |
| am | Amharic | 20.0 | Added |
| bn | Bengali | 18.0 | Added |
| my | Burmese | 20.0 | Added |
| eu | Basque | 18.0 | Added |
| ka | Georgian | 18.5 | Added |
| gu | Gujarati | 18.5 | Added |
| ha | Hausa | 19.5 | Added |
| ga | Irish | 17.5 | Not added |
| km | Khmer | 17.5 | Added |
| lo | Lao | 19.5 | Added |
| ml | Malayalam | 19.0 | Added |
| mt | Maltese | 20.0 | Added |
| mn | Mongolian | 18.5 | Not added |
| pa | Punjabi | 19.5 | Added |
| si | Sinhala | 15.5 | Not added |
| so | Somali | 19.0 | Not added |
| te | Telugu | 20.0 | Added |
| uz | Uzbek | 19.0 | Added |
| yo | Yoruba | 18.5 | Added |
| zu | Zulu | 20.0 | Added |

Irish was withheld because the pragmatic source contained an unnatural conditional and the annotation did not flag it. Sinhala was withheld because a malformed proverb was treated as standard. Somali was withheld because one pragmatic annotation could not be matched to an exact source substring. Mongolian passed the source-language tests but was withheld after a non-Mongolian character appeared in otherwise accurate Mongolian explanation text.

## Original catalog re-evaluation

All 57 original catalog languages passed both source-language cases. This stage comprised 114 real annotation requests and 114 separate GPT-5.6 judgments.

The same 57 languages were then tested as explanation languages with the English passage shown above. Fifty-five passed. Two were removed:

| Code | Language | Source cases | Explanation / 16 | Final result |
| --- | --- | --- | ---: | --- |
| mi | Maori | 2/2 passed | 10 | Removed |
| ur | Urdu | 2/2 passed | 13 | Removed |

Maori used several awkward English-calque expressions in the requested Maori output and incorrectly described “was likely” as passive. Urdu was natural and captured the pragmatic implication, but its grammar note incorrectly claimed that “to be taken” was omitted after “likely”; the translation also strengthened “unlikely” into an absolute lack of possibility. Because every scored dimension had to receive at least 3/4, Urdu did not pass despite reaching 13/16 overall.

The 55 original languages retained after both stages are Afrikaans, Arabic, Armenian, Azerbaijani, Belarusian, Bosnian, Bulgarian, Catalan, Chinese, Croatian, Czech, Danish, Dutch, English, Estonian, Finnish, French, Galician, German, Greek, Hebrew, Hindi, Hungarian, Icelandic, Indonesian, Italian, Japanese, Kannada, Kazakh, Korean, Latvian, Lithuanian, Macedonian, Malay, Marathi, Nepali, Norwegian, Persian, Polish, Portuguese, Romanian, Russian, Serbian, Slovak, Slovenian, Spanish, Swahili, Swedish, Tagalog, Tamil, Thai, Turkish, Ukrainian, Vietnamese, and Welsh.

## Scope

The combined test supports a catalog of 71 selectable text, explanation, and UI languages: 55 retained original languages plus 16 accepted candidates. Speech playback still depends on voices installed in the user's browser and operating system. Results may vary by passage, model snapshot, and prompt, so later native-speaker feedback can still improve the catalog.
