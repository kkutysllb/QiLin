import { fetch } from "@/core/api/fetcher";
import { getBackendBaseURL } from "@/core/config";

import type {
  CreateSkillRequest,
  CustomSkillContent,
  Skill,
  SupportSubdir,
} from "./type";

export async function loadSkills() {
  const skills = await fetch(`${getBackendBaseURL()}/api/skills`);
  const json = await skills.json();
  return json.skills as Skill[];
}

export async function enableSkill(skillName: string, enabled: boolean) {
  const response = await fetch(
    `${getBackendBaseURL()}/api/skills/${skillName}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        enabled,
      }),
    },
  );
  return response.json();
}

export interface InstallSkillRequest {
  thread_id: string;
  path: string;
}

export interface InstallSkillResponse {
  success: boolean;
  skill_name: string;
  message: string;
}

export async function installSkill(
  request: InstallSkillRequest,
): Promise<InstallSkillResponse> {
  const response = await fetch(`${getBackendBaseURL()}/api/skills/install`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    // Handle HTTP error responses (4xx, 5xx)
    const errorData = await response.json().catch(() => ({}));
    const errorMessage =
      errorData.detail ?? `HTTP ${response.status}: ${response.statusText}`;
    return {
      success: false,
      skill_name: "",
      message: errorMessage,
    };
  }

  return response.json();
}

/**
 * Create a custom skill from raw SKILL.md content via the wizard endpoint.
 *
 * Calls `POST /api/skills/custom`. The backend normalises the name,
 * validates, runs a security scan, and writes atomically. This bypasses
 * the Agent entirely — it is an explicit user action driven by the
 * create-skill wizard UI, and is NOT gated by
 * `skill_evolution.enabled`.
 *
 * @throws {Error} with `message` set to the backend `detail` string on 4xx/5xx
 *   (e.g. duplicate name, frontmatter validation, security scan block).
 */
export async function createSkill(
  request: CreateSkillRequest,
): Promise<CustomSkillContent> {
  const response = await fetch(`${getBackendBaseURL()}/api/skills/custom`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMessage =
      (errorData as { detail?: string }).detail ??
      `HTTP ${response.status}: ${response.statusText}`;
    throw new Error(errorMessage);
  }

  return response.json();
}

/**
 * Install a skill from a `.skill` ZIP archive uploaded directly via multipart.
 *
 * Calls `POST /api/skills/install-upload` (wizard-driven flow). No thread
 * context required. The backend unpacks, validates, scans, and atomically
 * installs via `ainstall_skill_from_archive`.
 *
 * @throws {Error} with `message` set to the backend `detail` string on
 *   non-2xx (e.g. duplicate name, bad frontmatter, security-scan block,
 *   non-.skill extension, oversize).
 */
export async function installSkillFromUpload(
  file: File,
): Promise<InstallSkillResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${getBackendBaseURL()}/api/skills/install-upload`, {
    method: "POST",
    body: formData,
    // NOTE: do NOT set Content-Type — the browser sets it with the correct
    // multipart boundary when body is a FormData.
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMessage =
      (errorData as { detail?: string }).detail ??
      `HTTP ${response.status}: ${response.statusText}`;
    throw new Error(errorMessage);
  }

  return response.json();
}

/**
 * Fetch a single custom skill with its raw SKILL.md content.
 *
 * Calls `GET /api/skills/custom/{skillName}`.
 *
 * @throws {Error} with `message` set to the backend `detail` string on
 *   non-2xx (e.g. skill not found, not editable).
 */
export async function getCustomSkill(
  skillName: string,
): Promise<CustomSkillContent> {
  const response = await fetch(
    `${getBackendBaseURL()}/api/skills/custom/${encodeURIComponent(skillName)}`,
  );
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMessage =
      (errorData as { detail?: string }).detail ??
      `HTTP ${response.status}: ${response.statusText}`;
    throw new Error(errorMessage);
  }
  return response.json();
}

/**
 * Update a custom skill's raw SKILL.md content.
 *
 * Calls `PUT /api/skills/custom/{skillName}`. The backend validates,
 * runs a security scan, writes atomically, and appends to history.
 *
 * @throws {Error} with `message` set to the backend `detail` string on
 *   non-2xx (e.g. skill not found, frontmatter validation, security
 *   scan block).
 */
export async function updateCustomSkill(
  skillName: string,
  content: string,
): Promise<CustomSkillContent> {
  const response = await fetch(
    `${getBackendBaseURL()}/api/skills/custom/${encodeURIComponent(skillName)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    },
  );
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMessage =
      (errorData as { detail?: string }).detail ??
      `HTTP ${response.status}: ${response.statusText}`;
    throw new Error(errorMessage);
  }
  return response.json();
}

/**
 * Delete a custom skill and all its files.
 *
 * Calls `DELETE /api/skills/custom/{skillName}`.
 *
 * @throws {Error} with `message` set to the backend `detail` string on
 *   non-2xx (e.g. skill not found).
 */
export async function deleteCustomSkill(
  skillName: string,
): Promise<void> {
  const response = await fetch(
    `${getBackendBaseURL()}/api/skills/custom/${encodeURIComponent(skillName)}`,
    { method: "DELETE" },
  );
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMessage =
      (errorData as { detail?: string }).detail ??
      `HTTP ${response.status}: ${response.statusText}`;
    throw new Error(errorMessage);
  }
}

/**
 * Upload one or more support files (scripts / references / templates /
 * assets) into an existing custom skill's subdirectory.
 *
 * Calls `POST /api/skills/custom/{skillName}/support-files` (wizard
 * "from scripts" flow). The target skill must already exist (created in
 * a prior wizard step). Each file is scanned: `scripts/` requires an
 * explicit 'allow' (warn is rejected), binary files skip the LLM scan.
 *
 * @throws {Error} with `message` set to the backend `detail` string on
 *   non-2xx (e.g. skill not found, invalid subdir, scan block, traversal).
 */
export async function uploadSupportFiles(
  skillName: string,
  files: File[],
  subdir: SupportSubdir,
): Promise<CustomSkillContent> {
  const formData = new FormData();
  for (const f of files) {
    formData.append("files", f);
  }
  formData.append("subdir", subdir);

  const response = await fetch(
    `${getBackendBaseURL()}/api/skills/custom/${encodeURIComponent(skillName)}/support-files`,
    {
      method: "POST",
      body: formData,
    },
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMessage =
      (errorData as { detail?: string }).detail ??
      `HTTP ${response.status}: ${response.statusText}`;
    throw new Error(errorMessage);
  }

  return response.json();
}
