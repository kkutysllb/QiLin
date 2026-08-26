import {
  createContext,
  useCallback,
  useContext,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import type { Subtask } from "./types";

export interface SubtaskContextValue {
  tasks: Record<string, Subtask>;
  setTasks: Dispatch<SetStateAction<Record<string, Subtask>>>;
}

export const SubtaskContext = createContext<SubtaskContextValue>({
  tasks: {},
  setTasks: () => {
    /* noop */
  },
});

export function SubtasksProvider({ children }: { children: React.ReactNode }) {
  const [tasks, setTasks] = useState<Record<string, Subtask>>({});
  return (
    <SubtaskContext.Provider value={{ tasks, setTasks }}>
      {children}
    </SubtaskContext.Provider>
  );
}

export function useSubtaskContext() {
  const context = useContext(SubtaskContext);
  if (context === undefined) {
    throw new Error(
      "useSubtaskContext must be used within a SubtaskContext.Provider",
    );
  }
  return context;
}

export function useSubtask(id: string) {
  const { tasks } = useSubtaskContext();
  return tasks[id];
}

export function useUpdateSubtask() {
  const { setTasks } = useSubtaskContext();
  const updateSubtask = useCallback(
    (task: Partial<Subtask> & { id: string }) => {
      // Functional update avoids closure-stale races: if a thread-switch
      // clear (setTasks({})) lands in the same React batch as a streaming
      // event, the old closure would otherwise re-introduce stale tasks.
      setTasks((prev) => {
        const existing = prev[task.id];

        // Bail out when the core fields haven't changed.  Returning the
        // same reference tells React the state is identical and skips the
        // re-render.  This is critical because updateSubtask is called from
        // a useEffect in MessageFeed that re-runs whenever messages change —
        // without this guard every render cycle produces a new state object,
        // creating an infinite update loop.
        if (
          existing &&
          existing.subagent_type === task.subagent_type &&
          existing.description === task.description &&
          existing.prompt === task.prompt &&
          existing.status === task.status &&
          !task.steps
        ) {
          return prev;
        }

        // Steps are appended (not replaced) so streaming events accumulate
        // a full timeline without losing prior entries.
        const merged: Partial<Subtask> = { ...task };
        if (task.steps && existing?.steps) {
          merged.steps = [...existing.steps, ...task.steps];
        }
        return {
          ...prev,
          [task.id]: { ...existing, ...merged } as Subtask,
        };
      });
    },
    [setTasks],
  );
  return updateSubtask;
}
