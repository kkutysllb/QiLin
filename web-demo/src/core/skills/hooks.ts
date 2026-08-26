import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createSkill,
  deleteCustomSkill,
  enableSkill,
  getCustomSkill,
  installSkill,
  installSkillFromUpload,
  updateCustomSkill,
  uploadSupportFiles,
} from "./api";
import type { InstallSkillRequest } from "./api";
import type { CreateSkillRequest, SupportSubdir } from "./type";

import { loadSkills } from ".";

export function useSkills() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["skills"],
    queryFn: () => loadSkills(),
  });
  return { skills: data ?? [], isLoading, error };
}

export function useEnableSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      skillName,
      enabled,
    }: {
      skillName: string;
      enabled: boolean;
    }) => {
      await enableSkill(skillName, enabled);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["skills"] });
    },
  });
}

export function useInstallSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (request: InstallSkillRequest) => {
      return await installSkill(request);
    },
    onSuccess: (result) => {
      if (result.success) {
        void queryClient.invalidateQueries({ queryKey: ["skills"] });
      }
    },
  });
}

/**
 * Mutation for the create-skill wizard.
 *
 * Calls `POST /api/skills/custom` via `createSkill`. On success it
 * invalidates the skills query so the new skill shows up in the
 * management list immediately. The caller is responsible for surfacing
 * `error.message` (the backend `detail` string) in the wizard UI.
 */
export function useCreateSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (request: CreateSkillRequest) => {
      return await createSkill(request);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["skills"] });
    },
  });
}

/**
 * Mutation for the wizard "install from .skill package" flow.
 *
 * Calls `POST /api/skills/install-upload` via `installSkillFromUpload`.
 * Invalidates the skills query on success so the newly installed skill
 * appears in the management list. The caller surfaces `error.message`
 * (the backend `detail` string) in the wizard UI.
 */
export function useInstallSkillFromUpload() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ file }: { file: File }) => {
      return await installSkillFromUpload(file);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["skills"] });
    },
  });
}

/**
 * Mutation for the wizard "from scripts" flow.
 *
 * Calls `POST /api/skills/custom/{name}/support-files` via
 * `uploadSupportFiles`. The caller must have created the skill first.
 * Invalidates the skills query on success so the updated skill tree
 * (now containing the uploaded scripts) refreshes.
 */
export function useUploadSupportFiles() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      skillName,
      files,
      subdir,
    }: {
      skillName: string;
      files: File[];
      subdir: SupportSubdir;
    }) => {
      return await uploadSupportFiles(skillName, files, subdir);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["skills"] });
    },
  });
}

/** Fetch a single custom skill's raw SKILL.md content. */
export function useCustomSkill(skillName: string | null) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["skills", "custom", skillName],
    queryFn: () => getCustomSkill(skillName!),
    enabled: !!skillName,
  });
  return { skill: data ?? null, isLoading, error };
}

/** Update a custom skill's raw SKILL.md content. */
export function useUpdateCustomSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      skillName,
      content,
    }: {
      skillName: string;
      content: string;
    }) => {
      return await updateCustomSkill(skillName, content);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["skills"] });
    },
  });
}

/** Delete a custom skill. */
export function useDeleteCustomSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (skillName: string) => {
      await deleteCustomSkill(skillName);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["skills"] });
    },
  });
}
