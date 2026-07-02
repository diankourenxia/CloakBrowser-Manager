/**
 * API client for CloakBrowser Manager backend.
 */

declare global {
  interface Window {
    cloakClient?: {
      apiBase?: string;
      platform?: string;
      mode?: "desktop" | "web";
    };
  }
}

const API_BASE = window.cloakClient?.apiBase?.replace(/\/$/, "") ?? "";

export function resolveApiUrl(path: string): string {
  if (!API_BASE) return path;
  return `${API_BASE}${path}`;
}

export function resolveWebSocketUrl(path: string): string {
  const fallbackBase = `${window.location.protocol}//${window.location.host}`;
  const base = API_BASE || fallbackBase;
  const url = new URL(path, base);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

export interface Profile {
  id: string;
  name: string;
  group_name: string;
  account_platform: string | null;
  account_username: string | null;
  home_url: string | null;
  fingerprint_seed: number;
  proxy: string | null;
  timezone: string | null;
  locale: string | null;
  platform: string;
  user_agent: string | null;
  screen_width: number;
  screen_height: number;
  gpu_vendor: string | null;
  gpu_renderer: string | null;
  hardware_concurrency: number | null;
  humanize: boolean;
  human_preset: string;
  headless: boolean;
  geoip: boolean;
  clipboard_sync: boolean;
  auto_launch: boolean;
  color_scheme: string | null;
  launch_args: string[];
  notes: string | null;
  user_data_dir: string;
  created_at: string;
  updated_at: string;
  last_launched_at: string | null;
  tags: { tag: string; color: string | null }[];
  status: "running" | "stopped";
  vnc_ws_port: number | null;
  display: string | null;
  cdp_url: string | null;
}

export interface ProfileCreateData {
  name: string;
  group_name?: string;
  account_platform?: string | null;
  account_username?: string | null;
  home_url?: string | null;
  fingerprint_seed?: number | null;
  proxy?: string | null;
  timezone?: string | null;
  locale?: string | null;
  platform?: string;
  user_agent?: string | null;
  screen_width?: number;
  screen_height?: number;
  gpu_vendor?: string | null;
  gpu_renderer?: string | null;
  hardware_concurrency?: number | null;
  humanize?: boolean;
  human_preset?: string;
  headless?: boolean;
  geoip?: boolean;
  clipboard_sync?: boolean;
  auto_launch?: boolean;
  color_scheme?: string | null;
  launch_args?: string[];
  notes?: string | null;
  tags?: { tag: string; color: string | null }[];
}

export interface LaunchResult {
  profile_id: string;
  status: string;
  vnc_ws_port: number | null;
  display: string | null;
  cdp_url: string | null;
}

export interface SystemStatus {
  running_count: number;
  binary_version: string;
  profiles_total: number;
}

export interface BatchResult {
  profile_id: string;
  ok: boolean;
  status: string | null;
  detail: string | null;
}

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const ERROR_MESSAGES: Record<string, string> = {
  Unauthorized: "需要重新登录",
  "Invalid token": "口令不正确",
  "Profile not found": "账号不存在",
  "Profile is already running": "账号已经在运行",
  "Profile is not running": "账号未运行",
  "Profile not running": "账号未运行",
  "Already running": "账号已经在运行",
  "Already stopped": "账号已经停止",
  "Failed to launch browser": "启动浏览器失败",
  "Native browser clipboard sync is not available": "本机窗口模式不支持远程剪贴板同步",
  "No file upload field found on the current page": "当前页面还没有可用的上传入口",
  "File upload field is not ready": "上传入口还没准备好，请先点页面里的上传按钮",
  "Selected files are too large": "选择的文件太大",
  "Internal Server Error": "服务出错",
};

function friendlyErrorMessage(message: string): string {
  return ERROR_MESSAGES[message] ?? message;
}

// Global 401 callback — set by App to trigger login page on auth failure
let _onUnauthorized: (() => void) | null = null;
export function setOnUnauthorized(cb: (() => void) | null) {
  _onUnauthorized = cb;
}

async function request<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(resolveApiUrl(path), {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    if (res.status === 401 && _onUnauthorized) {
      _onUnauthorized();
      throw new ApiError(401, friendlyErrorMessage("Unauthorized"));
    }
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new ApiError(res.status, friendlyErrorMessage(body.detail || res.statusText));
  }
  return res.json();
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("读取文件失败"));
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.includes(",") ? result.split(",", 2)[1] ?? "" : result);
    };
    reader.readAsDataURL(file);
  });
}

export const api = {
  authStatus: () =>
    request<{ auth_required: boolean; authenticated: boolean }>("/api/auth/status"),

  login: (token: string) =>
    request<{ ok: boolean }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),

  logout: () =>
    request<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),

  listProfiles: () => request<Profile[]>("/api/profiles"),

  getProfile: (id: string) => request<Profile>(`/api/profiles/${id}`),

  createProfile: (data: ProfileCreateData) =>
    request<Profile>("/api/profiles", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateProfile: (id: string, data: Partial<ProfileCreateData>) =>
    request<Profile>(`/api/profiles/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  cloneProfile: (id: string, name?: string) =>
    request<Profile>(`/api/profiles/${id}/clone`, {
      method: "POST",
      body: JSON.stringify({ name }),
    }),

  importProfiles: (profiles: ProfileCreateData[]) =>
    request<Profile[]>("/api/profiles/import", {
      method: "POST",
      body: JSON.stringify({ profiles }),
    }),

  exportProfiles: () => request<Profile[]>("/api/profiles/export"),

  deleteProfile: (id: string) =>
    request<{ ok: boolean }>(`/api/profiles/${id}`, { method: "DELETE" }),

  launchProfile: (id: string) =>
    request<LaunchResult>(`/api/profiles/${id}/launch`, { method: "POST" }),

  stopProfile: (id: string) =>
    request<{ ok: boolean }>(`/api/profiles/${id}/stop`, { method: "POST" }),

  batchLaunchProfiles: (ids: string[]) =>
    request<BatchResult[]>("/api/profiles/batch/launch", {
      method: "POST",
      body: JSON.stringify({ ids }),
    }),

  batchStopProfiles: (ids: string[]) =>
    request<BatchResult[]>("/api/profiles/batch/stop", {
      method: "POST",
      body: JSON.stringify({ ids }),
    }),

  getStatus: () => request<SystemStatus>("/api/status"),

  setClipboard: (id: string, text: string) =>
    request<{ ok: boolean }>(`/api/profiles/${id}/clipboard`, {
      method: "POST",
      body: JSON.stringify({ text }),
    }),

  getClipboard: (id: string) =>
    request<{ text: string }>(`/api/profiles/${id}/clipboard`),

  uploadProfileFiles: async (id: string, files: File[]) => {
    const payload = {
      files: await Promise.all(files.map(async (file) => ({
        name: file.name,
        mime_type: file.type || null,
        data_base64: await fileToBase64(file),
      }))),
    };
    return request<{ ok: boolean; count: number }>(`/api/profiles/${id}/files`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
};
