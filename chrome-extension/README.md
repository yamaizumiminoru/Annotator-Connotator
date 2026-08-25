# Annotator-Connotator Chrome extension v0.1

This lightweight extension sends selected text to the existing local Annotator-Connotator web app. It does not duplicate the annotation UI or call the OpenAI API by itself.

## Install

1. Start Annotator-Connotator locally so `http://localhost:4174/` is available.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode**.
4. Choose **Load unpacked**.
5. Select this `chrome-extension` directory.

## Use

1. Select text on a normal web page or in a text-selectable PDF opened in Chrome.
2. Right-click the selection.
3. Choose **Annotator-Connotatorで開く** / **Open in Annotator-Connotator**.
4. A new tab opens the local web app and places the selected text in the input box.
5. Review the text and press **解析 / Analyze** when ready.

The extension deliberately does **not** start analysis automatically.

## PDF support

The extension uses Chrome's selection context menu rather than injecting a content script into the PDF viewer. Therefore, when Chrome exposes selected PDF text through the context-menu API, the same command works for PDFs without any PDF parser or OCR.

Image-only/scanned PDFs are outside v0.1 because they do not provide selectable text. Chrome or OS restrictions may also prevent selection context-menu data from being exposed in some protected PDF contexts.

## Privacy

Selected text is passed in the URL fragment (`#ac_text=...`), not the query string. URL fragments are handled by the browser and are not sent to the local Node server. The web app removes the fragment after importing the text.
