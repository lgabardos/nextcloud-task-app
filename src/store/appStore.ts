import { create } from 'zustand';
import { NextcloudCredentials } from '../services/authService';
import { TaskList, Task } from '../services/calDavService';

interface AppState {
  // Auth
  credentials: NextcloudCredentials | null;
  setCredentials: (creds: NextcloudCredentials | null) => void;

  // Task lists
  taskLists: TaskList[];
  setTaskLists: (lists: TaskList[]) => void;

  // Tasks per list
  tasksByList: Record<string, Task[]>;
  setTasksForList: (listId: string, tasks: Task[]) => void;
  updateTask: (listId: string, task: Task) => void;
  removeTask: (listId: string, taskUrl: string) => void;
  addTask: (listId: string, task: Task) => void;

  // UI
  isLoading: boolean;
  setLoading: (v: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  credentials: null,
  setCredentials: (creds) => set({ credentials: creds }),

  taskLists: [],
  setTaskLists: (lists) => set({ taskLists: lists }),

  tasksByList: {},
  setTasksForList: (listId, tasks) =>
    set((state) => ({
      tasksByList: { ...state.tasksByList, [listId]: tasks },
    })),
  updateTask: (listId, updatedTask) =>
    set((state) => ({
      tasksByList: {
        ...state.tasksByList,
        [listId]: (state.tasksByList[listId] || []).map((t) =>
          t.url === updatedTask.url ? updatedTask : t
        ),
      },
    })),
  removeTask: (listId, taskUrl) =>
    set((state) => ({
      tasksByList: {
        ...state.tasksByList,
        [listId]: (state.tasksByList[listId] || []).filter((t) => t.url !== taskUrl),
      },
    })),
  addTask: (listId, task) =>
    set((state) => ({
      tasksByList: {
        ...state.tasksByList,
        [listId]: [task, ...(state.tasksByList[listId] || [])],
      },
    })),

  isLoading: false,
  setLoading: (v) => set({ isLoading: v }),
}));
