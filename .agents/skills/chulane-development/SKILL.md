---
name: chulane-development
description: Develop, test, or review the Chulane application using its agreed domain model, local-first architecture, Cordis plugins, Mastra tools, and synchronization requirements. Use for the Chulane rewrite and subsequent application features; editor-only Rivto changes have their own guidance.
---

# Chulane development

Use the agreed product decisions to implement the requested Chulane behavior. Read [references/requirements.md](references/requirements.md) before implementation or scope review. It is a portable snapshot of the final interview decisions, including the correction that third-party installation, file ingestion, and remote synchronization are required in the first release.

## Start from the actual state

Read the repository's applicable `AGENTS.md`, manifests, and the implementation paths relevant to the request. Locate the repository by its workspace, not a hardcoded machine path. Original evidence lives in `dev_notes/chulane-reimplementation-plan.md`, `dev_notes/chulane-reimplementation.md`, and the Chulane `CONTEXT.md`; earlier interview deferrals were superseded. Current user instructions take precedence over this snapshot.

The agreed rewrite replaces `app/chulane`, preserving it as `app/chulane_old`, while retaining the Rivto editor packages. When asked to implement that rewrite, inspect whether the rename has already happened; preserve existing work, avoid duplicate package identities in workspace resolution, and rewire the application hosts. Creating or loading this skill does not itself initiate the rewrite. For a scoped feature, implement that feature rather than restarting the entire application.

The old application folder has already been renamed. Agents mayreference its source files and [CONTEXT.md](http://CONTEXT.md), along with the existing application host folders, when developing Chulane. Verify the actual folder paths before reading them. Do not repeat the rename. The final Chulane requirements take precedence over older code.

## Put behavior in its owner

- Place domain rules, use cases, and replaceable service contracts under `src/domain/<context>/`. Keep React, Cordis, Drizzle, Zvec, Mastra, and transports outside domain rules.
- Keep replaceable storage, project services, retrieval, provider, extraction, and synchronization adapters at their integration boundaries. Reuse existing contracts and create only the modules the current behavior needs.
- Use Drizzle with SQLite for persisted records, Zvec for vector retrieval, Mastra for AI orchestration, and shadcn/ui with Tailwind CSS for presentation.
- Use `@deepseek-ai/cordis` directly for composition and lifecycle. Adapt DeepSeek Harness patterns, with Chulane-specific services/events; do not substitute Harness's agent runtime for Mastra.
- Route UI and AI tools through the same application use cases, validation, access checks, and transactions. Register and dispose UI/editor contributions through their owning lifecycle.

For plugin work, use local-folder installation with UI contributions and complete enable/disable/uninstall cleanup. Installation has no vetting gate. Keep this distinct from the application's agent tool approvals and workspace permissions. Preserve upstream notices when copying source.

## Preserve the non-obvious invariants

- Projects belong to personal or shared workspaces. Owner/editor/viewer checks govern knowledge access; page and project references do not grant access.
- A page is one document with writing and canvas views. Preserve its identity, CRDT history, and content across switching.
- Journals are private per-user pages outside project hierarchy, presented as vertically stacked days. Persist the local creation date as a date-only value; timezone changes do not move existing days. UTC audit timestamps use a `Z` suffix.
- `#tag` text does not require a tag record. Resolve optional definitions for the current user, including agent context, and offer to define unknown labels.
- Enforce agent mode, allowed tools, user access, and approval at execution. Default auto-approval is off; allow once or remember by agent/tool/workspace. A grant covers later arguments within that scope, not other workspaces or access rights.
- Persist private chats and pending approvals. Recovery must not automatically repeat interrupted mutations. Provider credentials, remembered approvals, and installed plugins remain device-local.
- Accept arbitrary pasted files, retaining bytes, metadata, and download access through replaceable managed storage. Missing extractors or renderers must not prevent storage. Only extracted text enters content-based retrieval.
- Persist binary CRDT state/updates before treating edits as locally durable. Restore state before editing. Portable JSON import is not offline reconciliation.
- Keep local-tab synchronization operational. Remote WebSocket synchronization, durable backend storage, offline retry/recovery, metadata conflict resolution, and tombstones are first-release implementation requirements.
- Pausing multi-user live sync preserves edits for later merge; it does not fork content or change permissions. Distinguish locally saved from remotely synced.
- Filter retrieval by access and configured inclusion/exclusion. Vector indexes are derived data rebuilt from canonical synchronized sources.

## Develop through failing behavior tests

For each behavior, define its observable result, write the narrowest meaningful test, and run it to confirm the expected failure before implementation. Trace callers and the full affected path before fixing the shared owner. Implement the minimum working change, run the test again, and refactor while it stays green.

Choose checks that exercise the layer being changed:

- Domain/use cases: ownership, hierarchy, journal dates, tags, modes, approvals, and metadata conflict/deletion semantics.
- Adapters: shared contract tests against concrete implementations; real temporary SQLite/Zvec stores for persistence, restart, and index behavior.
- AI: deterministic model/tool doubles for orchestration, execution permissions, failure, and recovery; do not use model prose as evidence of a completed mutation.
- Plugins/files: install and lifecycle cleanup; arbitrary attachment preservation, extractor availability/failure, citations, and reimport.
- Synchronization: separate local replicas and a real backend, offline reconnect, delivery retry, access checks, metadata conflicts, and tombstones.
- Browser/desktop: critical user workflows, page/canvas switching, journal sequence, inline tag behavior, approval prompts, and concurrent local tabs.

Use existing test tools where they cover the behavior. Run focused tests first, then applicable type checks, lint, affected suites, and builds; inspect actual manifests rather than assuming application checks are included in root scripts. Follow repository documentation and class-name conventions.

## Reference restriction

Use only reference files explicitly listed in this skill.
Do not scan dev_notes or load additional documentation or skills
unless the user explicitly requests it.

```
## Project references

Use only documents explicitly listed in this skill.
Read supporting references only when relevant to the current task.

Paths below are relative to the repository root:

- app/chulane/CONTEXT.md — canonical domain terminology.
- dev_notes/chulane-reimplementation-plan.md — final scope,
  architecture, implementation sequence, and acceptance criteria.
- docs/adr/0001-chulane-local-first-service-boundaries.md
- docs/adr/0002-chulane-user-owned-tag-vocabulary.md
- docs/adr/0003-chulane-personal-and-shared-workspaces.md
- docs/adr/0004-chulane-enforces-agent-tools-at-execution.md

ADRs explain architectural choices. If an older ADR conflicts
with the final plan, follow the final plan and update the ADR.

Do not use the historical interview dump as implementation guidance.
Current user instructions override these references.
```

Also update ADR 0001: remote synchronization and a runnable backend are required in the first release.

## Keep progress reviewable

Work in tested vertical slices. When undertaking the full rewrite, use the implementation sequence in the requirements reference as dependency guidance, not as permission to omit first-release capabilities. Report what works, what was tested, and remaining acceptance gaps. Keep the glossary and relevant decisions aligned with actual implementation; do not overwrite settled requirements with prototype shortcuts.
