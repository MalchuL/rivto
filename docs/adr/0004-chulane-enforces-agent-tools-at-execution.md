# Enforce agent modes and approvals at tool execution

Chulane exposes application operations as tools so a single chat can manipulate project knowledge. Agent modes constrain available tools, and execution requires one-time or remembered approval unless automatic approval is enabled; remembered approvals are scoped to agent, tool, and workspace. Execution checks always retain user ownership and role restrictions, because prompt instructions or tool visibility alone cannot enforce those boundaries.
