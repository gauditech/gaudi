import { useCallback, useState } from "react";
import { Todo } from "./model";
import { Editor } from "./Editor";

export type Props = {
  todos: Todo[];

  onCreate: (title: string) => void;
};

export function Header(props: Props) {
  const [title, setTitle] = useState<string>("");

  // --- event handlers

  const handleChange = useCallback(
    (value: string) => {
      const prepValue = value.trim();
      if (prepValue) {
        props.onCreate?.(prepValue);
      }
    },
    [props.onCreate, title, setTitle]
  );

  return (
    <header className="header">
      <h1>todos</h1>
      <Editor
        className="new-todo"
        placeholder="What needs to be done?"
        autoFocus
        cancelOnBlur={false}
        onChange={handleChange}
      />
    </header>
  );
}
