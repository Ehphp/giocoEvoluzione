# Generate creature transformation (concept-only)

Required Edge secrets, configured outside version control:

- `CREATURE_TRANSFORMATION_LAB_ENABLED`
- `CREATURE_TRANSFORMATION_ALLOWED_CONCEPT_MODES` (for example `MOCK,AI`)
- `OPENAI_API_KEY` (only when `AI` is allowed)
- `OPENAI_CONCEPT_MODEL` (only when `AI` is allowed)

The OpenAI adapter uses native `fetch` to call the Responses API. This avoids an additional Edge dependency and performs exactly one HTTP request per generator attempt, with `store: false`, JSON Schema strict output, and an explicit timeout.

The browser creates an idempotency key for each intentional click. The same key is kept through the domain retry of that request, but this phase has no persistence or cross-instance cache: it does **not** guarantee idempotency across Edge Function instances or separate HTTP requests.

`GENERATE_IMAGE`, image providers, Storage and creature updates are deliberately unsupported in this Function.

