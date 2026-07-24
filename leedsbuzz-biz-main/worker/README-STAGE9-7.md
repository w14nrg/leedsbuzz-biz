# LeedsBuzz.biz Stage 9.7 — OpenAI Search Fallback

Replace `worker/index.js` with this `index.js`.

What changed:
- White Archive still answers only the small whitelist of complete deterministic facts.
- Every other genuine Leeds United question goes directly to OpenAI Responses API with built-in `web_search`.
- OpenAI is preferred whenever `OPENAI_API_KEY` is configured.
- Uses high web-search context and high reasoning effort with GPT-5.1 by default.
- Removed the custom second/third-pass audit and manual source-page reconstruction pipeline from the live answer path.
- No live-answer cache: researched questions are searched live each time, avoiding stale cached mistakes.
- Plain-text answer sanitising remains, so Markdown asterisks are stripped.

The model can be overridden with the existing `BIZBOT_LIVE_MODEL` environment variable.
