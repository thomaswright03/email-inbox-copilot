# AI quality evals

A small labelled golden set that checks the spam classifier and the daily summary
whenever a prompt, the model id, or the rule-based fallback changes.

| Command | What it scores | Needs |
|---|---|---|
| `npm run eval` | The current prompts and model in `lib/ai.ts`, by calling Gemini | `GEMINI_API_KEY` and `GEMINI_PAID_TIER_PROJECT` for a **billing-enabled** project, in the shell or `.env.local` |
| `npm run eval:rules` | The rule-based fallback in `lib/rules.ts` (what users see with AI off or unavailable) | Nothing; runs offline and in CI |

Both print their scores and every mistake, and exit non-zero when a score is below
its threshold in [`scoring.ts`](scoring.ts).

## The golden set

Everything in `golden/` is invented: `example` domains, made-up people and companies.
No real email is used, and none may be added, because the eval sends it to Gemini.

- [`golden/spam.ts`](golden/spam.ts): 38 single emails labelled with the answer a careful
  person would give (`isSpam` plus one reason from `lib/spam-reasons.ts`). About a third are
  legitimate mail, several of which deliberately trip the spam keywords; cases marked
  `hard` are the ones a keyword filter gets wrong.
- [`golden/summary.ts`](golden/summary.ts): small inboxes, each with the items a useful
  summary has to mention (any one word from each group counts) and text it must never
  contain: links, or instructions an email tried to inject. One fixture checks that a
  Spanish summary is written in Spanish.

## Thresholds

| Score | Model (`npm run eval`) | Rules (`npm run eval:rules`) |
|---|---|---|
| Spam accuracy | 85% | 65% |
| Spam precision (flags that really are spam) | 85% | 85% |
| Spam recall (spam that gets flagged) | 75% | 50% |
| Reason accuracy (right reason on caught spam) | 70% | 80% |
| Summary coverage (must-mention items found) | 80% | n/a |
| Summary forbidden text | none | n/a |

The rule floor sits just under its measured baseline (2026-09-24: accuracy 68.4%,
precision 92.9%, recall 54.2%, reason 100%; the reason was 46.2% before the rules chose
"marketing" for promotional wording and "newsletter" only for digest-like mail, so its
floor is 80%). The golden set was used to write those reason rules, so
`lib/__tests__/rules.test.ts` also checks them on separate examples. The model thresholds are the targets the
product needs; record the first real run's scores here, and raise a threshold when the
model clears it comfortably.

| Date | Model | Spam accuracy | Precision | Recall | Reason | Summary coverage | Run by |
|---|---|---|---|---|---|---|---|
| *(first run pending: needs the paid-tier key)* | | | | | | | |

## When to run it

- Before merging any change to `MODEL`, `SUMMARY_SYSTEM_INSTRUCTION`, `SPAM_SYSTEM_INSTRUCTION`,
  the prompt text, the heuristic pre-filter in `lib/ai.ts`, or `lib/rules.ts`.
- When Google announces a replacement for the pinned model id: run it against the new id
  first and switch only if it passes.

`npm run eval` makes about 45 small Gemini calls (under 20k tokens in total). Each call
also writes one `ai_usage` log line (feature, model, token counts, latency, outcome; never
email content), the same line production writes for every model call.
