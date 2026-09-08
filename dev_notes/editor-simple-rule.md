# Editor Implementation Rule

Build the editor step by step.

Use `src/.stuff/editor` as reference, but do not copy its manager-heavy shape back into `src/editor`.

For each step:

- implement the smallest useful behavior that compiles;
- prefer one plain function/object over a manager or class;
- add a class only when state plus lifecycle clearly needs one;
- keep document mutations behind editor commands;
- move to the next feature only after the current slice is working.
