import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { addMCPServer, deleteMCPServer, loadMCPConfig, updateMCPConfig } from "./api";
import type { MCPServerConfig } from "./types";

/** Load the full MCP config (server map). */
export function useMCPConfig() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["mcpConfig"],
    queryFn: () => loadMCPConfig(),
  });
  return { config: data, isLoading, error, refetch };
}

/** Add a server, then refresh the config query. */
export function useAddMCPServer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      name,
      config,
    }: {
      name: string;
      config: MCPServerConfig;
    }) => addMCPServer(name, config),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["mcpConfig"] });
    },
  });
}

/**
 * Update one server via the full-config PUT endpoint:
 * re-fetch the current config, merge the edited server in, then PUT.
 */
export function useUpdateMCPServer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      name,
      config,
    }: {
      name: string;
      config: MCPServerConfig;
    }) => {
      const current = await loadMCPConfig();
      await updateMCPConfig({
        mcp_servers: {
          ...current.mcp_servers,
          [name]: config,
        },
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["mcpConfig"] });
    },
  });
}

/** Delete a server, then refresh the config query. */
export function useDeleteMCPServer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => deleteMCPServer(name),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["mcpConfig"] });
    },
  });
}
