# New block, container or element: working checklist

Copy this checklist into the task's working notes or response and fill it for the
requested feature before coding. Record the decision and relevant path for each
item; mark non-applicable items `N/A` with a reason. Update checkboxes with actual
implementation and validation evidence. This is a task plan, not a request to create
an unrelated repository file. Respect the user's requested scope and ask only when
a missing product decision cannot be inferred.

Feature and acceptance behavior: ___\
Kind and surfaces (Page, Edgeless, host extension): ___\
Nearest implementation and owning paths: ___

- [ ] **Data and registration:** type, defaults, validation, persisted fields,
      creation and exports/preset or host installation; identity and disposal: ___
- [ ] **Rendering and editing:** content versus shared shell/children, text or
      control owner, accessibility, focus, IME and remote/undo reconciliation: ___
- [ ] **Selection:** caret, partial/multi-block and structural selection, canvas
      selection, control interaction, panel scope and restoration where applicable: ___
- [ ] **Hierarchy and keyboard:** child ownership/visibility, empty and populated
      states, Enter, merge, indent/outdent, deletion and descendant preservation: ___
- [ ] **Movement and layout:** drag destinations, permissions, nesting, geometry,
      resize preview/commit and cancellation, as applicable: ___
- [ ] **Clipboard:** structured copy/cut/paste/duplicate, text versus structural
      selection, portable HTML/text, destination and ID/reference remapping, owned
      dependencies and cross-document behavior: ___
- [ ] **Persistence and history:** transaction boundaries, undo/redo, snapshots,
      reload and current state versus temporary previews: ___
- [ ] **Validation:** relevant model tests and real browser interactions, affected
      surfaces, edge cases and performance workflow; record commands and outcomes: ___
- [ ] **Completion:** each applicable item has evidence; list untested behavior,
      failures and limitations explicitly: ___
