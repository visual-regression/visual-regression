---
name: refresh-pricing
description: Refresh the vendor pricing data behind the cost calculator on visual-regression.dev/compare (apps/site/data/pricing/*.yml) — run scripts/fetch-pricing.mjs locally, check which pricing pages changed, re-extract their plans with Claude, verify every number against the vendor's page, record the page hashes, and open the pull request. Use when the user asks to refresh, check or update tool pricing, when a pricing page changed, or when adding the pricing file of a new tool.
---

# Refresh the tool pricing data

The calculator on `/compare` reads `apps/site/data/pricing/<tool>.yml`: the vendor's plans with the date they were read and a hash of the pricing page's text. `apps/site/scripts/fetch-pricing.mjs` keeps those files current. It runs **locally, by a maintainer, never in CI**: it needs an Anthropic API key, the pages have to be checked by a person, and a month-old number is better than a wrong one. Data rules (schema, what a file holds, "contact us" plans) live in the `site` skill; do not repeat them here.

Run from the repo root with dependencies installed (`pnpm install`).

## 1. See what changed

```sh
pnpm --filter @visual-regression/site pricing:fetch --check
```

Fetches every `pricingPage`, reduces it to text (`pageSection` narrows multi-product pages), hashes it and compares with `pageHash`. Prints one line per tool; exits 1 when any page changed. Needs no key. Stop here if nothing changed and the user only asked for a check.

Expected noise:

- `unreadable` (a bot challenge or an error page): the page cannot be fetched by a script. Applitools is known for this. Read it in a browser (the Playwright MCP tools work), update the file by hand, leave `pageHash` empty.
- `pageSection marker ... not found`: the vendor rewrote the page. Open it, pick new `start`/`end` markers that bracket only this product's plans, retry.

## 2. Re-extract the changed pages

```sh
export ANTHROPIC_API_KEY=...   # never commit it; `op read` or the shell profile
pnpm --filter @visual-regression/site pricing:fetch            # changed pages only
pnpm --filter @visual-regression/site pricing:fetch --only percy --force   # one tool, even if unchanged
pnpm --filter @visual-regression/site pricing:fetch --dry-run --only happo # print the request, send nothing
```

Claude gets the page text and a strict tool schema mirroring the YAML; it must only record numbers that appear on the page and leave unknowns `null`. The file is rewritten with the plans, `fetchedAt`, `pageHash` and `confidence`; `tool`, `pricingPage`, `pageSection` and the hand-written top-level `notes` are kept. A failed extraction fails the run; an unreadable page is a warning.

## 3. Check every number by hand

`git diff apps/site/data/pricing` and open each changed vendor's pricing page. For every changed value confirm it is on the page, that the billing period is right (monthly vs. billed yearly: record both when the page offers a toggle, `monthly` and `annualMonthly`), that the included quantity and the overage are for the same unit the file's `unit` names, and that `confidence` matches how directly the page states it. Fix by hand what the extraction got wrong, add a `notes` line for anything a reader needs to interpret the number, and keep `fetchedAt` as the day you checked.

Then record the hash of what you checked, for the files you edited by hand:

```sh
pnpm --filter @visual-regression/site pricing:fetch --accept --only <tool>
```

## 4. Format, test, build

```sh
pnpm exec prettier --write apps/site/data/pricing
pnpm --filter @visual-regression/site pricing:test     # the script's own tests (mocked fetch and client)
pnpm --filter @visual-regression/site build            # the pricing collection is validated here
pnpm lint
```

Load `verify-site` if the calculator component or the schema changed, not for data-only refreshes.

## 5. Open the pull request

A branch per refresh (`chore/pricing-refresh-<yyyy-mm>`), one commit `chore(site): refresh tool pricing data` (or `feat(site): add <tool> pricing` for a new file), PR against `main` listing the tools whose numbers changed and which were confirmed on the page. Never commit to `main`.

## Adding a tool

Create `apps/site/data/pricing/<tool>.yml` with the same stem as `data/tools/<tool>.yml` (only for tools whose `pricingModel` is not `free`), fill `tool`, `pricingPage`, `currency`, `unit` and the plans from the page by hand, then `--accept --only <tool>` to record the hash, and continue from step 4. pixsame gets no file while its hosted renderer is in preparation; the calculator says so instead of pricing it.
