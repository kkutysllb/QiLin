import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { deleteScheduledTask, fetchScheduledTasks } from "./api";

/** List all scheduled tasks for the current user. */
export function useScheduledTasks() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["scheduledTasks"],
    queryFn: () => fetchScheduledTasks(),
  });
  return { tasks: data ?? [], isLoading, error, refetch };
}

/** Delete a scheduled task and refresh the list. */
export function useDeleteScheduledTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => deleteScheduledTask(taskId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["scheduledTasks"] });
    },
  });
}
