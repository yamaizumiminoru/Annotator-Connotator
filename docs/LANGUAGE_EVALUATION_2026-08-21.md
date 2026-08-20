# Candidate language evaluation

Date: 2026-08-21

Model: `gpt-5.6-sol`

## Method

Twenty languages not present in the 57-language catalog were evaluated with two generated passages each. The informational passage tested translation and moderately complex grammar. The pragmatic passage tested an idiom, stance marker, politeness choice, register, or implication.

Every passage was sent through the app's real `/api/annotate` endpoint with English explanations. A separate GPT-5.6 request scored source naturalness, translation faithfulness, annotation accuracy, learning usefulness, and connotation/register handling from 0 to 4. The app also verified that every annotation could be located and rendered in the source text.

Languages that passed both source passages were then tested as explanation languages. The app translated and explained a common English passage containing a polite but discouraging implication. A separate GPT-5.6 request scored output-language naturalness, translation faithfulness, explanation accuracy, and connotation handling.

A language passed only when both passages passed. This is an AI-only screening test, not native-speaker certification.

## Results

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

## Scope

The combined test supports adding 16 languages as selectable text, explanation, and UI languages. Speech playback still depends on voices installed in the user's browser and operating system. Results may vary by passage, model snapshot, and prompt, so later native-speaker feedback can still improve the catalog.
