/**
 * Presents password authentication and local workspace management in both hosts.
 * Better Auth owns browser session state; application requests use the shared
 * service boundary. This component never imports storage implementations and
 * treats server authorization as authoritative even when controls are hidden.
 */
"use client";

import { useEffect, useState, type FormEvent } from "react";
import { notifications } from "@/lib/notifications";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import type { Workspace } from "@/domain/workspaces/types";
import type { LocalState } from "@/runtime/types";

const classes = {
  section: "flex flex-col gap-5 border-t border-border pt-6",
  heading: "text-xl font-semibold tracking-tight",
  form: "flex flex-col gap-4",
  field: "flex flex-col gap-2",
  row: "flex flex-wrap items-center gap-3",
  muted: "text-sm text-muted-foreground",
  error: "text-sm text-destructive",
  workspace: "flex flex-col gap-4 rounded-lg border border-border p-5",
  list: "flex flex-col gap-3",
};

/**
 * Loads an authorized application snapshot or performs one validated mutation.
 * @param body - Optional mutation arguments; omitted for reading current state.
 * @returns Successful response, rejecting with its user-facing error.
 */
async function requestLocal(body?: Record<string, string>): Promise<Response> {
  const response = await fetch("/api/local", {
    method: body ? "POST" : "GET",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.error ?? "The operation could not be completed.");
  }
  return response;
}

/** @returns Shared password login or the authenticated workspace interface. */
export function LocalWorkspaces() {
  const { data: session, isPending, error } = authClient.useSession();
  useEffect(() => {
    if (error) notifications.error("Unable to check your session. Reload to retry.");
  }, [error]);
  let content;
  if (isPending) content = <p role="status">Loading…</p>;
  else if (error) content = <p role="alert" className={classes.error}>Unable to check your session. Reload to retry.</p>;
  else if (session) content = <WorkspaceManager key={session.user.id} />;
  else content = <SignIn />;
  return content;
}

/** @returns A registration/login form backed by Better Auth's password flow. */
function SignIn() {
  const [registering, setRegistering] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  /** @param message - User-facing failure. @returns No value after inline and toast feedback. */
  function showError(message: string): void {
    setError(message);
    notifications.error(message);
  }
  /**
   * Submits credentials to Better Auth without retaining them in application state.
   * @param event - Native form submission.
   * @returns Resolves when the authentication attempt settles.
   */
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const credentials = { email: String(form.get("email")), password: String(form.get("password")) };
    setBusy(true);
    setError("");
    try {
      const result = registering
        ? await authClient.signUp.email({ ...credentials, name: String(form.get("name")) })
        : await authClient.signIn.email(credentials);
      if (result.error) showError(result.error.message ?? "Unable to sign in.");
    } catch { showError("Unable to reach the application. Try again."); }
    finally { setBusy(false); }
  }
  return (
    <section className={classes.section} aria-labelledby="auth-heading">
      <h2 id="auth-heading" className={classes.heading}>{registering ? "Create an account" : "Sign in"}</h2>
      <p className={classes.muted}>Your account and workspaces stay on this device.</p>
      <form onSubmit={submit} className={classes.form}>
        {registering && <div className={classes.field}>
          <Label htmlFor="auth-name">Name</Label>
          <Input id="auth-name" name="name" autoComplete="name" required maxLength={200} disabled={busy} />
        </div>}
        <div className={classes.field}>
          <Label htmlFor="auth-email">Email</Label>
          <Input id="auth-email" name="email" type="email" autoComplete="username" required disabled={busy} />
        </div>
        <div className={classes.field}>
          <Label htmlFor="auth-password">Password</Label>
          <Input id="auth-password" name="password" type="password" autoComplete={registering ? "new-password" : "current-password"}
            minLength={8} maxLength={128} required disabled={busy} />
        </div>
        {error && <p role="alert" className={classes.error}>{error}</p>}
        <div className={classes.row}>
          <Button type="submit" disabled={busy}>{busy ? "Please wait…" : registering ? "Register" : "Sign in"}</Button>
          <Button type="button" variant="ghost" disabled={busy} onClick={() => { setRegistering(!registering); setError(""); }}>
            {registering ? "Back to sign in" : "Create an account"}
          </Button>
        </div>
      </form>
    </section>
  );
}

/** @returns Authorized workspace metadata and owner-only management forms. */
function WorkspaceManager() {
  const [state, setState] = useState<LocalState | null>(null);
  const [error, setError] = useState("");
  const [pendingDeletion, setPendingDeletion] = useState<Workspace | null>(null);
  /** @param message - User-facing failure. @returns No value after inline and toast feedback. */
  function showError(message: string): void {
    setError(message);
    notifications.error(message);
  }
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    void requestLocal().then((response) => response.json()).then((result) => { if (active) setState(result); })
      .catch((failure: Error) => { if (active) showError(failure.message); });
    return () => { active = false; };
  }, []);

  /**
   * Runs a service mutation and reloads the authoritative application snapshot.
   * @param body - Operation and its domain arguments.
   * @returns Whether the mutation and authoritative snapshot reload both succeeded.
   */
  async function mutate(body: Record<string, string>): Promise<boolean> {
    let succeeded = false;
    setBusy(true);
    setError("");
    try {
      await requestLocal(body);
      setState(await (await requestLocal()).json());
      succeeded = true;
    } catch (failure) { showError(failure instanceof Error ? failure.message : "The operation failed."); }
    finally { setBusy(false); }
    return succeeded;
  }

  /**
   * Deletes only the selected workspace and retains the dialog if authorization or persistence fails.
   * @returns Resolves once deletion and state reload succeed, or error feedback is visible.
   */
  async function confirmDeletion(): Promise<void> {
    if (!pendingDeletion) return;
    const succeeded = await mutate({ action: "delete", workspaceId: pendingDeletion.id });
    if (succeeded) setPendingDeletion(null);
  }

  /**
   * Converts a named management form into a service operation.
   * @param event - Workspace form submission.
   * @returns Resolves once the submitted operation finishes.
   */
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const body: Record<string, string> = {};
    for (const [key, value] of new FormData(form)) body[key] = String(value);
    await mutate(body);
  }

  /** @returns Resolves once the current server session is revoked. */
  async function signOut() {
    setBusy(true);
    setError("");
    try {
      const result = await authClient.signOut();
      if (result.error) showError(result.error.message ?? "Unable to sign out.");
    } catch { showError("Unable to reach the application. Try again."); }
    finally { setBusy(false); }
  }

  return (
    <section className={classes.section} aria-labelledby="workspaces-heading">
      <div className={classes.row}>
        <h2 id="workspaces-heading" className={classes.heading}>Workspaces</h2>
        {state && <span className={classes.muted}>{state.user.name}</span>}
        <Button variant="outline" disabled={busy} onClick={signOut}>Sign out</Button>
      </div>
      {error && <p role="alert" className={classes.error}>{error}</p>}
      {!state && !error && <p role="status">Loading workspaces…</p>}
      {state && <>
        <form key={state.user.name} onSubmit={submit} className={classes.form}>
          <input type="hidden" name="action" value="update-profile" />
          <Label htmlFor="profile-name">Profile name</Label>
          <Input id="profile-name" name="name" defaultValue={state.user.name} required maxLength={200} disabled={busy} />
          <Button type="submit" variant="outline" disabled={busy}>Save profile</Button>
        </form>
        <form onSubmit={submit} className={classes.form}>
          <input type="hidden" name="action" value="create" />
          {state.workspaces.length === 0 && <p className={classes.muted}>Create a workspace to get started.</p>}
          <Label htmlFor="workspace-name">Workspace name</Label>
          <Input id="workspace-name" name="name" required maxLength={200} disabled={busy} />
          <Button type="submit" disabled={busy}>Create workspace</Button>
        </form>
        {state.workspaces.map((workspace) => (
          <article key={workspace.id} className={classes.workspace} aria-labelledby={`workspace-${workspace.id}`}>
            <h3 id={`workspace-${workspace.id}`} className={classes.heading}>{workspace.name}</h3>
            <p className={classes.muted}>{`Workspace · ${workspace.role}`}</p>
            {workspace.role === "owner" && <form onSubmit={submit} className={classes.row}>
              <input type="hidden" name="action" value="update" />
              <input type="hidden" name="workspaceId" value={workspace.id} />
              <Label htmlFor={`rename-${workspace.id}`}>Rename {workspace.name}</Label>
              <Input id={`rename-${workspace.id}`} name="name" defaultValue={workspace.name} required maxLength={200} disabled={busy} />
              <Button type="submit" variant="outline" disabled={busy}>Rename</Button>
            </form>}
              {workspace.role === "owner" && <Button variant="destructive" disabled={busy}
                onClick={() => { setError(""); setPendingDeletion(workspace); }}>Delete workspace</Button>}
              <ul className={classes.list}>
                {workspace.members.map((member) => {
                  const name = state.users.find((user) => user.id === member.userId)?.name ?? member.userId;
                  return <li key={member.userId} className={classes.row}>
                    <span>{name} · {member.role}</span>
                    {workspace.role === "owner" && <Button variant="ghost" disabled={busy}
                      aria-label={`Remove ${name} from ${workspace.name}`}
                      onClick={() => void mutate({ action: "remove-member", workspaceId: workspace.id, userId: member.userId })}>Remove</Button>}
                  </li>;
                })}
              </ul>
              {workspace.role === "owner" && <form onSubmit={submit} className={classes.form}>
                <input type="hidden" name="action" value="set-member" />
                <input type="hidden" name="workspaceId" value={workspace.id} />
                <Label htmlFor={`member-${workspace.id}`}>Member</Label>
                <NativeSelect id={`member-${workspace.id}`} name="userId" disabled={busy}>
                  {state.users.map((user) => <NativeSelectOption key={user.id} value={user.id}>{user.name}</NativeSelectOption>)}
                </NativeSelect>
                <Label htmlFor={`role-${workspace.id}`}>Role</Label>
                <NativeSelect id={`role-${workspace.id}`} name="role" defaultValue="viewer" disabled={busy}>
                  <NativeSelectOption value="viewer">Viewer</NativeSelectOption>
                  <NativeSelectOption value="editor">Editor</NativeSelectOption>
                  <NativeSelectOption value="owner">Owner</NativeSelectOption>
                </NativeSelect>
                <Button type="submit" variant="outline" disabled={busy}>Save member</Button>
              </form>}
          </article>
        ))}
        {state.deletedWorkspaces.length > 0 && <section className={classes.form} aria-labelledby="deleted-workspaces-heading">
          <h3 id="deleted-workspaces-heading" className={classes.heading}>Deleted workspaces</h3>
          <p className={classes.muted}>Restore a workspace with its previous members and access rights.</p>
          {state.deletedWorkspaces.map((workspace) => <div key={workspace.id} className={classes.row}>
            <span>{workspace.name}</span>
            <Button variant="outline" disabled={busy} aria-label={`Restore ${workspace.name}`}
              onClick={() => void mutate({ action: "restore", workspaceId: workspace.id })}>Restore</Button>
          </div>)}
        </section>}
      </>}
      <Dialog open={pendingDeletion !== null} onOpenChange={(open) => { if (!open && !busy) setPendingDeletion(null); }}>
        <DialogContent showCloseButton={!busy}>
          <DialogTitle>Delete {pendingDeletion?.name}?</DialogTitle>
          <DialogDescription>
            This workspace and its content will become unavailable to all members.
            Owners can restore it later with the same members and access rights.
          </DialogDescription>
          {error && <p role="alert" className={classes.error}>{error}</p>}
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setPendingDeletion(null)}>Cancel</Button>
            <Button variant="destructive" disabled={busy} onClick={() => void confirmDeletion()}>Delete workspace</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
