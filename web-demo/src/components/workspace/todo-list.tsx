import {
  CheckIcon,
  CircleDotIcon,
  CircleIcon,
  ListTodoIcon,
  LoaderCircleIcon,
  XIcon,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { Todo } from "@/core/todos";
import { cn } from "@/lib/utils";

import {
  QueueItem,
  QueueItemContent,
  QueueList,
} from "../ai-elements/queue";

export function TodoList({
  className,
  todos,
  collapsed: controlledCollapsed,
  onToggle,
}: {
  className?: string;
  todos: Todo[];
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const isControlled = controlledCollapsed !== undefined;
  const collapsed = isControlled ? controlledCollapsed : internalCollapsed;

  const handleToggle = () => {
    if (isControlled) {
      onToggle?.();
    } else {
      setInternalCollapsed((prev) => !prev);
    }
  };

  const isEmpty = !todos || todos.length === 0;

  return (
    <div
      className={cn(
        "bg-background flex h-full w-full flex-col overflow-hidden border-l",
        className,
      )}
    >
      <header
        className="bg-accent flex min-h-9 shrink-0 items-center justify-between px-4 text-sm"
        onClick={handleToggle}
      >
        <div className="text-muted-foreground flex items-center gap-2">
          <ListTodoIcon className="size-4" />
          <div>任务清单</div>
        </div>
        {onToggle && (
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="关闭任务面板"
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
          >
            <XIcon className="size-4" />
          </Button>
        )}
      </header>
      <main
        className={cn(
          "min-h-0 grow flex-col overflow-y-auto px-2 py-2 transition-all duration-300 ease-out",
          collapsed ? "hidden" : "flex",
        )}
      >
        {isEmpty ? (
          <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
            暂无任务清单
          </div>
        ) : (
          <QueueList className="w-full">
            {todos.map((todo, i) => {
              const status = todo.status ?? "pending";
              return (
                <QueueItem
                  key={i + (todo.content ?? "")}
                  className={cn(
                    "border-l-2 pl-3",
                    status === "completed" &&
                      "border-l-emerald-500/60",
                    status === "in_progress" &&
                      "border-l-blue-500 bg-blue-500/5",
                    status === "pending" && "border-l-muted-foreground/20",
                  )}
                >
                  <div className="flex items-center gap-2">
                    {/* Status indicator icon */}
                    {status === "completed" ? (
                      <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                        <CheckIcon className="size-3" />
                      </span>
                    ) : status === "in_progress" ? (
                      <LoaderCircleIcon className="size-4 shrink-0 animate-spin text-blue-500" />
                    ) : (
                      <CircleIcon className="size-4 shrink-0 text-muted-foreground/40" />
                    )}
                    <QueueItemContent
                      completed={status === "completed"}
                      className={cn(
                        status === "completed" &&
                          "text-muted-foreground/50 line-through",
                        status === "in_progress" &&
                          "text-foreground font-medium",
                        status === "pending" && "text-muted-foreground",
                      )}
                    >
                      {todo.content}
                    </QueueItemContent>
                    {/* Status badge */}
                    {status === "in_progress" && (
                      <span className="ml-auto shrink-0 rounded-full bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-400">
                        进行中
                      </span>
                    )}
                    {status === "completed" && (
                      <span className="ml-auto shrink-0 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                        已完成
                      </span>
                    )}
                    {status === "pending" && (
                      <span className="text-muted-foreground/60 ml-auto shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium">
                        待处理
                      </span>
                    )}
                  </div>
                </QueueItem>
              );
            })}
          </QueueList>
        )}
      </main>
    </div>
  );
}
