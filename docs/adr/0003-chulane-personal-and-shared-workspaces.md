# Unify individual and shared knowledge ownership through workspaces

## Current decision — updated 2026-10-28

All workspaces use one ownership and membership model. Users create workspaces
explicitly. Owners
manage settings and membership; editors may write; viewers may read; a workspace
must retain at least one owner. Access requires membership. Deleted workspaces
remain inaccessible until restored by an owner.

Authenticated application services are bound to the verified user when created
for a request. Workspace roles are checked against current membership at each
operation. Profile provisioning does not create a workspace.

## Earlier decision — superseded by the current decision


Chulane supports both personal knowledge and multiple local users. Projects belong
to workspaces, with a personal workspace representing an individual user's
ownership, rather than introducing separate user-owned and group-owned projects.

Rules confirmed on 2026-10-09: each local user receives one private personal
workspace whose membership cannot change. Shared workspaces may have multiple
owners. Owners manage settings and membership; owners and editors may edit
content; viewers may read. Removing or demoting the last owner is rejected.
References never grant access. A user's private journal belongs to their personal
workspace and remains outside the project hierarchy.

Local login uses email and password through Better Auth. Email is a local login
identifier; verification emails and a remote account are not required. Passwordless
profile selection and a startup authentication-mode switch are not part of this
decision. Better Auth owns credentials and sessions; Chulane's profile uses the
same stable identity to own workspaces. Provisioning the profile and its personal
workspace is one transaction and can be safely retried after interrupted login.

Chulane's user is authoritative for application profile fields, including name.
Authentication supplies the stable identity and an initial registration name
only when the application user does not exist. Later Better Auth name changes
do not rename the Chulane user, and an existing user is returned without
validating the authentication provider's display name.
