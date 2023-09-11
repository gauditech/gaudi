import React, { useMemo } from "react";
import { Todo } from "./model";

export interface Props {
  todos: Todo[];

  onClearCompleted: () => void;
}

export const Footer: React.FC<Props> = (props: Props) => {
  const itemsTotal = props.todos.length;
  const itemsLeft = useMemo(
    () => props.todos.filter((t) => !t.completed),
    [props.todos]
  );
  const itemsCompleted = useMemo(
    () => props.todos.filter((t) => t.completed),
    [props.todos]
  );

  return (
    <>
      {itemsTotal > 0 && (
        <>
          {/* <!-- This footer should be hidden by default and shown when there are todos --> */}
          <footer className="footer">
            {/* <!-- This should be `0 items left` by default --> */}
            <span className="todo-count">
              <strong>{itemsLeft.length}</strong>{" "}
              {pluralizeItemsLabel(itemsLeft.length)} left
            </span>
            {/* <!-- Remove this if you don't implement routing --> */}
            {/* <ul className="filters">
              <li>
                <a className="selected" href="#/">
                  All
                </a>
              </li>
              <li>
                <a href="#/active">Active</a>
              </li>
              <li>
                <a href="#/completed">Completed</a>
              </li>
            </ul>
            */}

            {/* <!-- Hidden if no completed items are left ↓ --> */}
            <button
              className="clear-completed"
              onClick={props.onClearCompleted}
              hidden={itemsCompleted.length === 0}
            >
              Clear completed
            </button>
          </footer>
        </>
      )}
    </>
  );
};

function pluralizeItemsLabel(count: number) {
  if (count % 10 === 1) {
    return "item";
  } else {
    return "items";
  }
}
