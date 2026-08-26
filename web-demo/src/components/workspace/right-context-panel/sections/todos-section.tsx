"use client";

import { ListTodoIcon } from "lucide-react";

import { useI18n } from "@/core/i18n/hooks";
import { useActiveThreadMessages } from "@/hooks/use-active-thread";
import { useThreadTodos } from "@/hooks/use-thread-todos";

import { PanelEmpty, PanelSection } from "../panel-section";

export function TodosSection() {
  const { t } = useI18n();
  const { messages } = useActiveThreadMessages();
  const todos = useThreadTodos(messages);

  return (
    <PanelSection
      id="todos"
      icon={ListTodoIcon}
      title={t.rightPanel.todos}
      count={todos.length}
    >
      {todos.length === 0 ? (
        <PanelEmpty text={t.rightPanel.empty} />
      ) : (
        <ul className="space-y-1.5">
          {todos.map((todo, idx) => (
            <li key={idx} className="flex items-start gap-2 text-xs">
              <span
                className={
                  todo.status === "completed"
                    ? "text-emerald-500"
                    : "text-muted-foreground"
                }
              >
                {todo.status === "completed" ? "☑" : "☐"}
              </span>
              <span className="flex-1 break-all text-muted-foreground">
                {todo.content ?? JSON.stringify(todo)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </PanelSection>
  );
}
