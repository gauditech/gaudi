import { ChangeEvent, useCallback, useMemo, useState } from "react";
import { Todo, TodoUpdate } from "./model";
import classNames from "classnames";
import { Editor } from "./Editor";

export type Props = {
  todos: Todo[];

  onToggleAll: (completed: boolean) => void;
  onUpdate: (data: TodoUpdate) => void;
  onDestroy: (id: number) => void;
};

export function List(props: Props) {
  const itemsTotalCount = props.todos.length;
  const itemsLeftCount = useMemo(
    () => props.todos.filter((t) => !t.completed).length,
    [props.todos]
  );

  // --- event handlers

  const handleToggleAll = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      props.onToggleAll?.(e.target.checked);
    },
    [props.onToggleAll]
  );

  return (
    <>
      {/* <!-- This section should be hidden by default and shown when there are todos --> */}
      {itemsTotalCount > 0 && (
        <section className="main">
          <input
            id="toggle-all"
            className="toggle-all"
            type="checkbox"
            checked={itemsLeftCount === 0}
            onChange={handleToggleAll}
          />
          <label htmlFor="toggle-all">Mark all as complete</label>

          <ul className="todo-list">
            {props.todos.map((t) => (
              <Item
                key={t.id}
                todo={t}
                onUpdate={props.onUpdate}
                onDestroy={props.onDestroy}
              />
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

// ----- TODO Item

type ItemProps = {
  todo: Todo;

  onUpdate?: (todo: TodoUpdate) => void;
  onDestroy?: (id: number) => void;
};
function Item(props: ItemProps) {
  const [editing, setEditing] = useState<boolean>(false);

  const handleEditorChange = useCallback(
    (value: string) => {
      const prepValue = value.trim();
      if (prepValue) {
        props.onUpdate?.({ ...props.todo, title: prepValue });
      }

      setEditing(false);
    },
    [props.onUpdate, props.todo, setEditing]
  );
  const handleEditorCancel = useCallback(() => {
    setEditing(false);
  }, [setEditing]);

  return (
    <li
      className={classNames({
        editing: editing,
        completed: props.todo.completed,
      })}
    >
      <div className="view">
        <input
          className="toggle"
          type="checkbox"
          checked={props.todo.completed}
          onChange={(e) =>
            props.onUpdate?.({
              ...props.todo,
              completed: e.target.checked,
            })
          }
        />
        <label onDoubleClick={() => setEditing(true)}>{props.todo.title}</label>
        <button
          className="destroy"
          onClick={() => props.onDestroy?.(props.todo.id)}
        ></button>
      </div>
      {editing && (
        <Editor
          value={props.todo.title}
          className="edit"
          autoFocus
          onChange={handleEditorChange}
          onCancel={handleEditorCancel}
        />
      )}
    </li>
  );
}
