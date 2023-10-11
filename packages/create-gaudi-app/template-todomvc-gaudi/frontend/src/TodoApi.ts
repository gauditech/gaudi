import { createClient } from "./api-client";
import { Todo, TodoCreate, TodoUpdate } from "./model";

export const TodoApi = {
  async create(data: TodoCreate) {
    const resp = await apiClient().api.todo.create(data);
    if (resp.kind === "error") {
      throw new Error(
        `[API] Error creating todo. ${resp.error} (${resp.status})`
      );
    }

    return resp.data;
  },

  async update(data: TodoUpdate) {
    const resp = await apiClient().api.todo.update(data.id, data);
    if (resp.kind === "error") {
      throw new Error(
        `[API] Error updating todo. ${resp.error} (${resp.status})`
      );
    }

    return resp.data;
  },

  async list() {
    const resp = await apiClient().api.todo.list();
    if (resp.kind === "error") {
      throw new Error(
        `[API] Error fetching todo list. ${resp.error} (${resp.status})`
      );
    }

    return resp.data;
  },

  async destroy(id: number) {
    const resp = await apiClient().api.todo.delete(id);
    if (resp.kind === "error") {
      throw new Error(
        `[API] Error deleting todo. ${resp.error} (${resp.status})`
      );
    }
  },

  async destroyCompleted(todos: Todo[]) {
    for (const todo of todos) {
      try {
        if (todo.completed) {
          await TodoApi.destroy(todo.id);
        }
      } catch (err) {
        console.error(err);
      }
    }
  },

  async toggleAll(todos: Todo[], completed: boolean) {
    for (const todo of todos) {
      try {
        await TodoApi.update({ ...todo, completed });
      } catch (err) {
        console.error(err);
      }
    }
  },
};

/** Create API client with common props */
function apiClient() {
  return createClient({ rootPath: "http://localhost:3001" });
}
