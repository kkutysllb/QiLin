---
description: "Per-account token usage in Settings: daily stacked bars with a foldable legend, a cache-hit-rate area, and a per-session table."
kind: "package-reference"
---

# @qilin-agent/client-ui-usage

English | [中文](README.zh.md)

## Summary

The Usage settings section answers what one account spent. It reads that account's usage from its own runtime and draws the current month as one stacked bar per day — uncached input, output, and cache reads — with the share of prompt tokens served from cache drawn as an area behind the bars. Each legend entry folds its series out of the chart, hovering or focusing a bar reads back that day, and a table breaks the month down by session. All-time figures come from the ledger's own totals.

## Table of Contents

- [Use this page](#use-this-page)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-page"></a>
## Use this page

Open Settings and choose **Usage**. The page needs no configuration; it reads `GET /api/usage/me` from the runtime that serves the browser, which forwards the request to the deployment's ledger with the credential that runtime reports under.

| Part | What it shows |
|---|---|
| Cards | Today, this month, all time, and all-time Turns and sessions, each with the cache hit rate of the traffic it covers |
| Chart | One stacked bar per day of the current month, with the hit-rate area behind them |
| Legend | One entry per bar series plus the area; selecting an entry folds that series out of the chart |
| Table | This month by session: input, output, cache reads, hit rate, and total |

An administrator's page reads the deployment instead of one account: the same chart summed over every account, and the table breaking the month down by account rather than by session.

The chart is keyboard-reachable: each bar takes focus, left and right move between days, and Escape dismisses the read-back. An unreachable deployment says so rather than drawing an empty month, and a ledger that held more Turns than one answer carries says the newest are shown.

<a id="understand-the-implementation"></a>
## Understand the implementation

`src/client/chart.ts` holds the page's arithmetic as pure functions: bucketing records into browser-local days (quiet days included, because a chart that closed a gap would draw a quiet week as a busy one), the cache hit rate, the fold state, and the layout of stacked bands, gridlines, and the area path. `UsageSection.tsx` holds the state a reader drives and renders those values; it draws no chart library and no literal colors.

<a id="further-exploration"></a>
## Further Exploration

- [Usage report](../../session/usage-report/README.md) is the runtime half: it reports Turns to the ledger and serves the read this page uses.
- [Settings general](../ui-settings-general/README.md) owns the settings shell this section registers into.
- [Web styling](../../../docs/web-styling.md) states the token and localization rules this page follows.

<a id="model-experience"></a>
## Model Experience

None, as this page reads a ledger and draws it, adding no prompt, tool, or model-visible output.

#### KV Cache effect

No request is altered; the page only reports the cache traffic the provider already billed.

## Known Limitations and Deferred Work

- **The month is the browser's month.** Days bucket by the browser's local calendar, so a reader who travels sees the month their own clock describes rather than the deployment's.
- **One answer is bounded.** The read carries the newest records a response bound allows; a month that reported more shows its newest days and says so.
- **Only an administrator sees other accounts.** Everyone else's page reads its own account alone, because the deployment's read is scoped by the credential the runtime reports under; an ordinary account cannot ask for another's usage.

<a id="dev-note"></a>
### Dev Note

The section registers into `settings.section` rather than adding a settings shell of its own, and its dictionaries ship with the package so the page has no locale of its own to maintain.
