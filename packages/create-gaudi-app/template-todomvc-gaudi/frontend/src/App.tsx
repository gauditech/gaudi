import React, { useCallback, useEffect, useState } from "react";
import "./App.css";
import { Header } from "./Header";
import { Footer } from "./Footer";
import { List } from "./List";
import { Todo, TodoUpdate } from "./model";
import { TodoApi } from "./TodoApi";

function App() {
  const [todos, setTodos] = useState<Todo[]>([]);

  const fetchAll = useCallback(async () => {
    const data = await TodoApi.list();
    setTodos(data);
  }, [setTodos]);

  // initial list
  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleCreate = useCallback(
    async (title: string) => {
      await TodoApi.create({ title });

      await fetchAll();
    },
    [fetchAll]
  );

  const handleClearCompleted = useCallback(async () => {
    await TodoApi.destroyCompleted(todos);
    await fetchAll();
  }, [todos, fetchAll]);

  const handleUpdate = useCallback(
    async (data: TodoUpdate) => {
      await TodoApi.update(data);
      await fetchAll();
    },
    [fetchAll]
  );

  const handleDestroy = useCallback(
    async (id: number) => {
      await TodoApi.destroy(id);
      await fetchAll();
    },
    [fetchAll]
  );

  const handleToggleAll = useCallback(
    async (completed: boolean) => {
      await TodoApi.toggleAll(todos, completed);
      await fetchAll();
    },
    [todos, fetchAll]
  );

  return (
    <>
      <section className="todoapp">
        <Header todos={todos} onCreate={handleCreate} />

        <List
          todos={todos}
          onUpdate={handleUpdate}
          onDestroy={handleDestroy}
          onToggleAll={handleToggleAll}
        />

        <Footer todos={todos} onClearCompleted={handleClearCompleted} />
      </section>

      <footer className="info">
        <p>Double-click to edit a todo</p>
        <p>
          Created by <a href="https://gaudi.tech">Gaudi</a>
        </p>
        <p>
          Part of <a href="https://todomvc.com">TodoMVC</a>
        </p>
      </footer>
    </>
  );
}

export default App;
