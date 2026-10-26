---
kind: upgrade-guide
description: "QiLin supplies Schedule, its clock reading, and its page through the opt-in bundle `@qilin-agent/experimental-schedule-bundle`, not through the Web composition."
---

# Schedule ships as an opt-in bundle

English | [中文](guide.zh.md)

## Change

Upstream removed its experimental Schedule bundle in release 0.2.1-alpha.1 and moved the capability into the Web composition and the presets: `@deepseek-ai/dsh-web-app` mounts the `schedule` service and the `ui-schedule` page in every Web profile, and its `standard`, `@qilin-agent/kylin`, and `ptc` presets declare the clock reading with the four `schedule_*` tools. QiLin keeps the earlier supply form.

`@qilin-agent/experimental-schedule-bundle` is listed in `OPTIONAL_BUNDLES` in `packages/boot/app-boot/src/profile.ts`, so every installation ships it switched off and the Plugins page offers it in the Official group as Automation tasks. Enabling it appends the package to the profile's `qilin.profile.bundles` list, and its patch inserts the `time-context`, `schedule`, and `ui-schedule` rows at the profile root. The shipped Web composition carries none of the three rows, and the shipped `ptc` preset declares the `tool-schedule` row, which registers the four tools only while the `schedule` service is in scope.

What a consumer observes differently from the upstream form:

- With the bundle off, the shipped Web profile has no Automation tasks page, no Session reminder catalog, no clock reading, and no reminder tools. The page and the catalog are absent, not empty.
- The clock row is a profile-root row here, so a top-level `- id: time-context` override reaches it. Upstream declares the clock row in Web presets, where a top-level override matches no row.
- At that release QiLin shipped one preset, `ptc`. Upstream's `standard`, `@qilin-agent/kylin`, and `ptc` presets declare the clock row and the four tools; `minimal` declares neither.
- The selection lives in `qilin.profile.bundles`; switching the bundle off in Plugins removes it.

The [bundle README](../../../../packages/experimental/schedule-bundle/README.md) records why this deployment keeps the bundle instead of folding the three rows into the Web composition.

## Migration

1. Enable the bundle in Plugins → Official → Automation tasks; the [user guide](../../../user/guide/schedule.md#create-reminders) owns the wording for enabling it and creating the first reminder. A profile manifest that another tool writes selects it by adding `@qilin-agent/experimental-schedule-bundle` to `qilin.profile.bundles`.
2. Do not apply upstream's retirement steps. Dropping the bundle selection and relying on Web-composition rows leaves QiLin with no `schedule` service, so the page, the catalog, the clock reading, and the tools stay absent.
3. Keep `schedule` and `ui-schedule` overrides in `cordis.patch.yml` or a `--patch` overlay. They apply only while the bundle is selected, because the shipped composition declares neither row. A top-level `time-context` override also applies only while the bundle is selected.
4. Presets that declare their own clock or reminder tool rows keep mounting them. A preset's `tool-schedule` row registers nothing while the `schedule` service is absent, so the bundle remains the shipped way to provide the service and the page.
5. Confirm: the sidebar shows Automation tasks, the Session header shows a clock while an active reminder exists, and the model receives `schedule_create`, `schedule_list`, `schedule_update`, and `schedule_delete`. Disabling the bundle removes all four and keeps stored tasks and delivery records on disk, where the next enablement reuses them.
