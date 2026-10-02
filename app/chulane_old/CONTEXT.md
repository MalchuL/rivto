# Chulane

Chulane supports personal knowledge work for multiple users through an AI-first, extensible editor.

## Language

**Chulane**:
The knowledge application encompassing projects, pages, canvas, journals, tags, and AI-assisted work.
_Avoid_: Rivto (the underlying editor has a separate meaning)

**Page**:
A knowledge document that can be viewed and edited as writing or as a canvas while retaining its identity and content.
_Avoid_: Canvas document (when referring to a separate entity)

**Project**:
A container for knowledge pages that may be nested inside another project.

**Workspace**:
An ownership boundary for projects and their knowledge, serving either an individual user or a group of users.

**Personal workspace**:
A workspace belonging to one user, using the same knowledge ownership model as a shared workspace.

**Tag**:
A label written as `#name` in page content, optionally described by user-owned vocabulary. A label may appear even when no description has been defined.
_Avoid_: Project tag

**Tag definition**:
A user's description and other parameters for a tag name, supplying meaning without restricting where the tag can appear.

**Journal**:
A user's collection of daily pages, presented in a vertically scrolling sequence and independent of projects.

**Journal day**:
The date assigned to a journal page using the user's local calendar when it is created. It has no time of day and remains unchanged when the user's timezone changes.

**Workspace role**:
A user's access level in a workspace: owner, editor, or viewer. References to another workspace's content do not grant access to it.

**Agent mode**:
The permitted behavior of an agent: ask reads knowledge, plan reads and proposes changes, agent executes permitted tools, and custom selects a tool pool.

**Tool approval**:
A user's authorization for an agent to execute a tool, granted once or remembered for that agent, tool, and workspace. Automatic approval does not expand the agent's tools or the user's access.

**Page reference**:
A reference from page content to another page, available in journal pages as well as other pages.

**Project reference**:
A reference from page content to a project, available in journal pages as well as other pages.

**Attachment**:
A file retained by Chulane with its filename, type, size, and download access, whether or not its contents can be rendered or searched.

**Extracted source text**:
Text derived from an attachment for knowledge retrieval, retaining a reference to the source for citations. An attachment can exist without extracted source text.
