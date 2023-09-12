export type Todo = {
  id: number;
  title: string;
  completed: boolean;
};

export type TodoCreate = Pick<Todo, "title">;
export type TodoUpdate = Todo;
