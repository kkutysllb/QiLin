---
description: "Add Schedule, its reminder catalog, and the Automation tasks page from the plugin manager."
kind: "package-bundle"
---

# @qilin-agent/experimental-schedule-bundle

English | [中文](README.zh.md)

## Summary

This optional bundle inserts the three Schedule rows the shipped Web composition leaves out: `time-context`, `schedule`, and `ui-schedule`. Shipped profiles leave it switched off.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Open Plugins in the Web sidebar and enable Automation tasks, marked by an alarm clock icon. A live root Agent then receives `schedule_create`, `schedule_list`, `schedule_update`, and `schedule_delete`, the Session header shows its reminder catalog, the sidebar's Automation tasks entry opens the task-management page and the right Sidebar holds the selected task's detail, and each eligible step appends one clock reading with the current time, the browser zone attached to the open request, and the elapsed time since the preceding model-visible message. The bundle's page lists Time awareness, Task scheduling, and Task interface with their state. Disabling the bundle restores the shipped composition; stored tasks remain on disk.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Maintainer details — click to expand</summary>

`cordis.patch.yml` inserts the three rows, and `package.json` depends on their packages so each row resolves from this bundle. `OPTIONAL_BUNDLES` in `packages/boot/app-boot/src/profile.ts` names this package and `apps/cli` depends on it, so every installation ships it switched off and the plugin manager offers it in the Official group. Selecting it appends the bundle to the profile's `dsh.profile.bundles` list.

| File | Role |
|---|---|
| [`cordis.patch.yml`](cordis.patch.yml) | Inserts the `time-context`, `schedule`, and `ui-schedule` rows |
| [`package.json`](package.json) | The row packages as dependencies |
| [`locale/en.json`](locale/en.json), [`locale/zh.json`](locale/zh.json) | Plugin-manager title and description |
| [`icon.svg`](icon.svg) | Plugin-manager icon |
| [`src/index.ts`](src/index.ts) | Empty module entry; the patch is the runtime content |

</details>

### Why the bundle is kept

Upstream composes the `schedule` service row and the `ui-schedule` page row in the web-app patch and keeps the clock row and the four reminder tools in each preset. This deployment keeps all three rows in this opt-in bundle and the four tools in the shipped `ptc` preset, and it does not retire the bundle into the Web composition.

- One selection carries the capability together: the service, the page, and the clock reading switch on and off as a unit, and disabling restores the composition without a rebuild or a release.
- The enablement path already exists elsewhere: `OPTIONAL_BUNDLES` offers the bundle in the Official group, and [the user guide](../../../docs/user/guide/schedule.md) and [the subsystem page](../../../docs/subsystems/schedule.md) name it as the way to add Schedule to a shipped Web profile.

What differs from the upstream form, in behavior a consumer can observe: a shipped Web profile here carries no `schedule` row at all until the bundle is selected, so the Automation tasks page and the reminder catalog are absent rather than empty; and a delegated child is refused by [the tools](../../schedule/tool-schedule/README.md) and by `ScheduleService` itself instead of by a preset's tool filter.

Maintenance boundary: this package owns composition rows — the ids, the plugin names, and the patch shape. Scheduling behavior stays in [`@qilin-agent/schedule`](../../schedule/schedule/README.md), the page in [`@qilin-agent/client-ui-schedule`](../../client/ui-schedule/README.md), the clock reading in [`@qilin-agent/time-context`](../../context/time-context/README.md), and the tools in [`@qilin-agent/tool-schedule`](../../schedule/tool-schedule/README.md); a change in any of those needs no edit here unless a row's id or config changes. This bundle must not gain scheduling logic or re-declare a row another layer inserts. Retiring it stays a single change: move the three rows into `packages/bundle/web-app/cordis.patch.yml`, delete `cordis.patch.yml` and `tests/patch.spec.ts`, and drop the `OPTIONAL_BUNDLES` entry.

-----

<a id="further-exploration"></a>
## Further Exploration

- [Schedule subsystem](../../../docs/subsystems/schedule.md) — durable tasks, occurrence resolution, and delivery.
- [Schedule service](../../schedule/schedule/README.md) — Host task storage, activation, and the record format.
- [Web bundle](../../bundle/web-app/README.md) — the composition this bundle adds the rows to.

-----

<a id="model-experience"></a>
## Model Experience

### Reminder tools and clock readings

#### What the model sees

A live root Agent gains `schedule_create`, `schedule_list`, `schedule_update`, and `schedule_delete`. `time-context` appends one durable user message per eligible step carrying the sampled instant, the browser zone attached to the open request, and the elapsed time since the preceding model-visible message.

#### Token effect

Selecting the bundle adds four Schedule tool schemas to every live root Agent request and one durable clock reading per eligible step; a conversation that never creates a reminder pays both.

#### KV Cache effect

The tool schemas change the request prefix once when the bundle mounts; each appended reading is new visible content after that prefix, so existing entries are not invalidated.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- While the bundle is on, its page offers a switch per row, as for every bundle. The three rows work only together: switching `schedule` off leaves the task page without its service, and switching `time-context` off leaves the model without the current time for new reminders.
- A profile patch or `--patch` overlay that targets `time-context`, `schedule`, or `ui-schedule` by id matches no row while this bundle is not selected: the loader warns `patch: entry <id> not found` for each such patch. Select this bundle instead of switching the rows on by id.

-----

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Maintainer details — click to expand</summary>

None.

</details>
