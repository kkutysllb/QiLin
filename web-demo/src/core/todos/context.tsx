"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const STORAGE_KEY = "kworks.todosPanelOpen";

export interface TodosContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
}

const TodosContext = createContext<TodosContextValue | undefined>(undefined);

interface TodosProviderProps {
  children: ReactNode;
}

export function TodosProvider({ children }: TodosProviderProps) {
  const [open, setOpenState] = useState(false);

  // Restore from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored !== null) setOpenState(stored === "true");
    } catch {
      /* ignore */
    }
  }, []);

  const setOpen = useCallback((next: boolean) => {
    setOpenState(next);
    try {
      localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = useCallback(() => setOpen(!open), [open, setOpen]);

  const value = useMemo(
    () => ({ open, setOpen, toggle }),
    [open, setOpen, toggle],
  );

  return (
    <TodosContext.Provider value={value}>{children}</TodosContext.Provider>
  );
}

export function useTodos() {
  const context = useContext(TodosContext);
  if (context === undefined) {
    throw new Error("useTodos must be used within a TodosProvider");
  }
  return context;
}
