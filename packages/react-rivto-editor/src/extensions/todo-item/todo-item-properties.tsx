import { useCallback, useId, useRef, useState } from "react";
import { XIcon } from "lucide-react";
import { editorControlProps } from "../../constants";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { NativeSelect, NativeSelectOption } from "../../components/ui/native-select";
import { Textarea } from "../../components/ui/textarea";
import { TODO_STATUSES, type TodoItemPropertiesModalProps, type TodoItemPropertiesPatch, type TodoItemStatus, type TodoItemProps } from "./todo-item-model";
import { TODO_MODAL_CLASS, TODO_MODAL_HEADER_CLASS, TODO_MODAL_CLOSE_CLASS, TODO_MODAL_FIELDS_CLASS, TODO_MODAL_FIELD_CLASS, TODO_MODAL_TIMESTAMPS_CLASS } from "./todo-item-classes";

/**
 * Renders the default auto-committing TODO properties dialog.
 *
 * The dialog is a shadcn/Radix `Dialog` rendered in a portal, so it escapes
 * the editable block tree. Every close path (close button, Escape, pointer
 * outside) funnels through `onOpenChange(false)` and commits the local draft
 * exactly once.
 *
 * @param props - Current typed block and close callback owned by the extension.
 * @returns Modal dialog with local form state and read-only timestamps.
 */
export function DefaultTodoItemPropertiesModal({
  block,
  onClose,
}: TodoItemPropertiesModalProps) {
  const closedRef = useRef(false);
  const fieldId = useId();
  const initial = block.props;
  const [draft, setDraft] = useState<TodoItemPropertiesPatch>({
    status: initial.status,
    description: initial.description,
    priority: initial.priority,
    project: initial.project,
  });

  /** Commits the local draft once for every close path. */
  const finish = useCallback((): void => {
    if (closedRef.current) return;
    closedRef.current = true;
    onClose(draft);
  }, [draft, onClose]);

  return (
    <Dialog open onOpenChange={(open) => { if (!open) finish(); }}>
      <DialogContent className={TODO_MODAL_CLASS} showCloseButton={false}>
        <div className={TODO_MODAL_HEADER_CLASS}>
          {/* Radix names the dialog from its title via aria-labelledby, so the
              title text is the public accessible name hosts and tests rely on. */}
          <DialogTitle className="text-base">TODO item properties</DialogTitle>
          <DialogDescription className="sr-only">Edit status, description, priority, and project.</DialogDescription>
          <Button {...editorControlProps} variant="ghost" size="icon-sm" className={TODO_MODAL_CLOSE_CLASS} type="button" aria-label="Close properties" onClick={finish}>
            <XIcon />
          </Button>
        </div>
        <div className={TODO_MODAL_FIELDS_CLASS}>
          <Label className={TODO_MODAL_FIELD_CLASS} htmlFor={`${fieldId}-status`}>Status
            <NativeSelect {...editorControlProps} id={`${fieldId}-status`} className="w-full" value={draft.status}
              onChange={(event) => setDraft({ ...draft, status: event.target.value as TodoItemStatus })}>
              {TODO_STATUSES.map((status) => <NativeSelectOption key={status} value={status}>{status}</NativeSelectOption>)}
            </NativeSelect>
          </Label>
          <Label className={TODO_MODAL_FIELD_CLASS} htmlFor={`${fieldId}-description`}>Description
            <Textarea {...editorControlProps} id={`${fieldId}-description`} className="min-h-[72px]" value={draft.description}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
          </Label>
          <Label className={TODO_MODAL_FIELD_CLASS} htmlFor={`${fieldId}-priority`}>Priority
            <NativeSelect {...editorControlProps} id={`${fieldId}-priority`} className="w-full" value={draft.priority}
              onChange={(event) => setDraft({ ...draft, priority: Number(event.target.value) as TodoItemProps["priority"] })}>
              {[1, 2, 3, 4].map((priority) => <NativeSelectOption key={priority} value={priority}>{priority}</NativeSelectOption>)}
            </NativeSelect>
          </Label>
          <Label className={TODO_MODAL_FIELD_CLASS} htmlFor={`${fieldId}-project`}>Project
            <Input {...editorControlProps} id={`${fieldId}-project`} value={draft.project}
              onChange={(event) => setDraft({ ...draft, project: event.target.value })} />
          </Label>
        </div>
        <div className={TODO_MODAL_TIMESTAMPS_CLASS}>
          <span>Created <time dateTime={initial.createdAt}>{initial.createdAt}</time></span>
          <span>Updated <time dateTime={initial.updatedAt}>{initial.updatedAt}</time></span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

