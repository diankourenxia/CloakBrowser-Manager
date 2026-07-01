import { Save, Shuffle, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { Profile, ProfileCreateData } from "../lib/api";

interface ProfileFormProps {
  profile: Profile | null; // null = create mode
  onSave: (data: ProfileCreateData) => Promise<void>;
  onDelete?: () => Promise<void>;
  onCancel: () => void;
}

const RESOLUTION_PRESETS: Record<string, { width: number; height: number }> = {
  "1920 × 1080 (Full HD)": { width: 1920, height: 1080 },
  "2560 × 1440 (QHD)": { width: 2560, height: 1440 },
  "1366 × 768 (HD)": { width: 1366, height: 768 },
  "1440 × 900": { width: 1440, height: 900 },
  "1536 × 864": { width: 1536, height: 864 },
  "1280 × 720 (720p)": { width: 1280, height: 720 },
};

const TAG_COLORS = [
  "#6366f1", // indigo
  "#22c55e", // green
  "#f59e0b", // amber
  "#ef4444", // red
  "#06b6d4", // cyan
  "#a855f7", // purple
  "#f97316", // orange
  "#ec4899", // pink
];

const GPU_PRESETS: Record<string, { vendor: string; renderer: string }> = {
  "NVIDIA RTX 3070": {
    vendor: "Google Inc. (NVIDIA)",
    renderer: "ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 (0x00002484) Direct3D11 vs_5_0 ps_5_0, D3D11)",
  },
  "NVIDIA RTX 4070": {
    vendor: "Google Inc. (NVIDIA)",
    renderer: "ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 (0x00002786) Direct3D11 vs_5_0 ps_5_0, D3D11)",
  },
  "AMD RX 6800 XT": {
    vendor: "Google Inc. (AMD)",
    renderer: "ANGLE (AMD, AMD Radeon RX 6800 XT (0x000073BF) Direct3D11 vs_5_0 ps_5_0, D3D11)",
  },
  "Intel UHD 770": {
    vendor: "Google Inc. (Intel)",
    renderer: "ANGLE (Intel, Intel(R) UHD Graphics 770 (0x00004680) Direct3D11 vs_5_0 ps_5_0, D3D11)",
  },
  "Apple M3 (macOS)": {
    vendor: "Google Inc. (Apple)",
    renderer: "ANGLE (Apple, ANGLE Metal Renderer: Apple M3, Unspecified Version)",
  },
};

const DEFAULT_PROFILE_FORM: ProfileCreateData = {
  name: "",
  group_name: "默认",
  platform: "windows",
  screen_width: 1920,
  screen_height: 1080,
  timezone: "Asia/Shanghai",
  locale: "zh-CN",
  humanize: false,
  human_preset: "default",
  headless: false,
  geoip: false,
  clipboard_sync: true,
  auto_launch: false,
  launch_args: [],
  tags: [],
};

export function ProfileForm({ profile, onSave, onDelete, onCancel }: ProfileFormProps) {
  const isEdit = profile !== null;

  const [form, setForm] = useState<ProfileCreateData>(DEFAULT_PROFILE_FORM);

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [tagColor, setTagColor] = useState<string | null>("#6366f1");
  const [launchArgInput, setLaunchArgInput] = useState("");

  useEffect(() => {
    if (profile) {
      setForm({
        name: profile.name,
        group_name: profile.group_name,
        account_platform: profile.account_platform,
        account_username: profile.account_username,
        home_url: profile.home_url,
        fingerprint_seed: profile.fingerprint_seed,
        proxy: profile.proxy,
        timezone: profile.timezone,
        locale: profile.locale,
        platform: profile.platform,
        user_agent: profile.user_agent,
        screen_width: profile.screen_width,
        screen_height: profile.screen_height,
        gpu_vendor: profile.gpu_vendor,
        gpu_renderer: profile.gpu_renderer,
        hardware_concurrency: profile.hardware_concurrency,
        humanize: profile.humanize,
        human_preset: profile.human_preset,
        headless: profile.headless,
        geoip: profile.geoip,
        clipboard_sync: profile.clipboard_sync,
        auto_launch: profile.auto_launch,
        color_scheme: profile.color_scheme,
        launch_args: profile.launch_args ?? [],
        notes: profile.notes,
        tags: profile.tags ?? [],
      });
    } else {
      setForm(DEFAULT_PROFILE_FORM);
    }
  }, [profile?.id]);

  const set = <K extends keyof ProfileCreateData>(key: K, value: ProfileCreateData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    if (!confirm("确定删除这个账号吗？浏览器数据会一并删除。")) return;
    setDeleting(true);
    try {
      await onDelete();
    } finally {
      setDeleting(false);
    }
  };

  const applyGpuPreset = (name: string) => {
    const preset = GPU_PRESETS[name];
    if (preset) {
      set("gpu_vendor", preset.vendor);
      set("gpu_renderer", preset.renderer);
    }
  };

  const randomizeSeed = () => {
    set("fingerprint_seed", Math.floor(Math.random() * 90000) + 10000);
  };

  const currentResolution = Object.entries(RESOLUTION_PRESETS).find(
    ([, v]) => v.width === form.screen_width && v.height === form.screen_height,
  )?.[0] ?? "custom";

  const addTag = () => {
    const tag = tagInput.trim();
    if (!tag) return;
    if (form.tags?.some((t) => t.tag === tag)) return;
    set("tags", [...(form.tags ?? []), { tag, color: tagColor }]);
    setTagInput("");
  };

  const removeTag = (tag: string) => {
    set("tags", (form.tags ?? []).filter((t) => t.tag !== tag));
  };

  const addLaunchArg = () => {
    const arg = launchArgInput.trim();
    if (!arg) return;
    if ((form.launch_args ?? []).includes(arg)) return;
    set("launch_args", [...(form.launch_args ?? []), arg]);
    setLaunchArgInput("");
  };

  const removeLaunchArg = (idx: number) => {
    set("launch_args", (form.launch_args ?? []).filter((_, i) => i !== idx));
  };

  return (
    <form onSubmit={handleSubmit} className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">
            {isEdit ? "编辑账号" : "新建账号"}
          </h2>
          {isEdit && onDelete && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="btn-danger flex items-center gap-1.5"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>{deleting ? "删除中..." : "删除"}</span>
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onCancel} className="btn-secondary">
            返回
          </button>
          <button type="submit" disabled={saving} className="btn-primary flex items-center gap-1.5">
            <Save className="h-3.5 w-3.5" />
            <span>{saving ? "保存中..." : isEdit ? "保存" : "创建"}</span>
          </button>
        </div>
      </div>

      <div className="space-y-5">
        {/* Basic */}
        <section>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">账号</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="label">账号名称</label>
              <input
                className="input"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="例如：TikTok 店铺 1"
                required
              />
            </div>
            <div>
              <label className="label">分组</label>
              <input
                className="input"
                value={form.group_name ?? "默认"}
                onChange={(e) => set("group_name", e.target.value || "默认")}
                placeholder="默认"
              />
            </div>
            <div>
              <label className="label">平台</label>
              <input
                className="input"
                value={form.account_platform ?? ""}
                onChange={(e) => set("account_platform", e.target.value || null)}
                placeholder="Amazon、TikTok、Meta..."
              />
            </div>
            <div>
              <label className="label">登录账号</label>
              <input
                className="input"
                value={form.account_username ?? ""}
                onChange={(e) => set("account_username", e.target.value || null)}
                placeholder="seller@example.com"
              />
            </div>
            <div>
              <label className="label">首页地址</label>
              <input
                className="input"
                value={form.home_url ?? ""}
                onChange={(e) => set("home_url", e.target.value || null)}
                placeholder="https://example.com/dashboard"
              />
            </div>
            <div>
              <label className="label">系统</label>
              <select
                className="input"
                value={form.platform}
                onChange={(e) => set("platform", e.target.value)}
              >
                <option value="windows">Windows</option>
                <option value="macos">macOS</option>
                <option value="linux">Linux</option>
              </select>
            </div>
          </div>
        </section>

        {/* Network */}
        <section>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">网络</h3>
          <div className="space-y-3">
            <div>
              <label className="label">代理</label>
              <input
                className="input"
                value={form.proxy ?? ""}
                onChange={(e) => set("proxy", e.target.value || null)}
                placeholder="http://user:pass@host:port"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">时区</label>
                <input
                  className="input"
                  value={form.timezone ?? ""}
                  onChange={(e) => set("timezone", e.target.value || null)}
                  placeholder="Asia/Shanghai"
                />
              </div>
              <div>
                <label className="label">语言</label>
                <input
                  className="input"
                  value={form.locale ?? ""}
                  onChange={(e) => set("locale", e.target.value || null)}
                  placeholder="zh-CN"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={form.geoip ?? false}
                onChange={(e) => set("geoip", e.target.checked)}
                className="rounded border-border bg-surface-2"
              />
              根据代理 IP 自动匹配时区和语言
            </label>
          </div>
        </section>

        {/* Hardware */}
        <details className="rounded-md border border-border bg-surface-1/40 p-3">
          <summary className="cursor-pointer text-xs font-semibold text-gray-400 uppercase tracking-wider">
            高级设备设置
          </summary>
          <div className="space-y-3 mt-3">
            <div>
              <label className="label">指纹种子</label>
              <div className="flex gap-2">
                <input
                  className="input flex-1 no-spin"
                  type="number"
                  value={form.fingerprint_seed ?? ""}
                  onChange={(e) => set("fingerprint_seed", e.target.value ? Number(e.target.value) : null)}
                  placeholder="自动生成"
                />
                <button
                  type="button"
                  onClick={randomizeSeed}
                  className="btn-secondary px-2.5"
                  title="随机生成"
                >
                  <Shuffle className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div>
              <label className="label">屏幕尺寸</label>
              <select
                className="input"
                value={currentResolution}
                onChange={(e) => {
                  const preset = RESOLUTION_PRESETS[e.target.value];
                  if (preset) {
                    set("screen_width", preset.width);
                    set("screen_height", preset.height);
                  }
                }}
              >
                {Object.keys(RESOLUTION_PRESETS).map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
                <option value="custom">自定义</option>
              </select>
            </div>
            {currentResolution === "custom" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">宽度</label>
                  <input
                    className="input"
                    type="number"
                    value={form.screen_width ?? 1920}
                    onChange={(e) => set("screen_width", Number(e.target.value))}
                  />
                </div>
                <div>
                  <label className="label">高度</label>
                  <input
                    className="input"
                    type="number"
                    value={form.screen_height ?? 1080}
                    onChange={(e) => set("screen_height", Number(e.target.value))}
                  />
                </div>
              </div>
            )}
            <div>
              <label className="label">CPU 线程数</label>
              <input
                className="input"
                type="number"
                value={form.hardware_concurrency ?? ""}
                onChange={(e) => set("hardware_concurrency", e.target.value ? Number(e.target.value) : null)}
                placeholder="自动生成"
              />
            </div>
            <div>
              <label className="label">GPU 预设</label>
              <select
                className="input"
                value=""
                onChange={(e) => {
                  if (e.target.value) applyGpuPreset(e.target.value);
                }}
              >
                <option value="">选择预设...</option>
                {Object.keys(GPU_PRESETS).map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">GPU 厂商</label>
              <input
                className="input"
                value={form.gpu_vendor ?? ""}
                onChange={(e) => set("gpu_vendor", e.target.value || null)}
                placeholder="自动生成"
              />
            </div>
            <div>
              <label className="label">GPU 型号</label>
              <input
                className="input"
                value={form.gpu_renderer ?? ""}
                onChange={(e) => set("gpu_renderer", e.target.value || null)}
                placeholder="自动生成"
              />
            </div>
          </div>
        </details>

        {/* Behavior */}
        <details className="rounded-md border border-border bg-surface-1/40 p-3">
          <summary className="cursor-pointer text-xs font-semibold text-gray-400 uppercase tracking-wider">
            高级偏好
          </summary>
          <div className="space-y-3 mt-3">
            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={form.humanize ?? false}
                onChange={(e) => set("humanize", e.target.checked)}
                className="rounded border-border bg-surface-2"
              />
              模拟真人鼠标、键盘和滚动
            </label>
            {form.humanize && (
              <div>
                <label className="label">操作风格</label>
                <select
                  className="input"
                  value={form.human_preset}
                  onChange={(e) => set("human_preset", e.target.value)}
                >
                  <option value="default">默认</option>
                  <option value="careful">谨慎慢速</option>
                </select>
              </div>
            )}
            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={form.clipboard_sync ?? true}
                onChange={(e) => set("clipboard_sync", e.target.checked)}
                className="rounded border-border bg-surface-2"
              />
              默认开启剪贴板同步
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={form.auto_launch ?? false}
                onChange={(e) => set("auto_launch", e.target.checked)}
                className="rounded border-border bg-surface-2"
              />
              客户端启动时自动打开
            </label>
            <div>
              <label className="label">外观</label>
              <select
                className="input"
                value={form.color_scheme ?? ""}
                onChange={(e) => set("color_scheme", e.target.value || null)}
              >
                <option value="">跟随系统</option>
                <option value="light">浅色</option>
                <option value="dark">深色</option>
                <option value="no-preference">无偏好</option>
              </select>
            </div>
            <div>
              <label className="label">浏览器标识</label>
              <input
                className="input"
                value={form.user_agent ?? ""}
                onChange={(e) => set("user_agent", e.target.value || null)}
                placeholder="自动生成"
              />
            </div>
          </div>
        </details>

        {/* Tags */}
        <section>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">标签</h3>
          {(form.tags ?? []).length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {(form.tags ?? []).map((t) => (
                <span
                  key={t.tag}
                  className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-surface-3 text-gray-300"
                  style={t.color ? { backgroundColor: `${t.color}20`, color: t.color } : undefined}
                >
                  {t.tag}
                  <button
                    type="button"
                    onClick={() => removeTag(t.tag)}
                    className="hover:opacity-70"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex gap-2 items-center">
            <div className="flex gap-1">
              {TAG_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setTagColor(c)}
                  className="w-4 h-4 rounded-full border-2 transition-transform"
                  style={{
                    backgroundColor: c,
                    borderColor: tagColor === c ? "#fff" : "transparent",
                    transform: tagColor === c ? "scale(1.2)" : undefined,
                  }}
                />
              ))}
            </div>
            <input
              className="input flex-1"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
              placeholder="添加标签..."
            />
            <button type="button" onClick={addTag} className="btn-secondary text-xs">
              添加
            </button>
          </div>
        </section>

        {/* Launch Args */}
        <details className="rounded-md border border-border bg-surface-1/40 p-3">
          <summary className="cursor-pointer text-xs font-semibold text-gray-400 uppercase tracking-wider">
            启动参数
          </summary>
          <p className="text-xs text-gray-500 my-3">高级 Chromium 启动参数，一般不用填写。</p>
          {(form.launch_args ?? []).length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {(form.launch_args ?? []).map((arg, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-surface-3 text-gray-300 font-mono"
                >
                  {arg}
                  <button
                    type="button"
                    onClick={() => removeLaunchArg(idx)}
                    className="hover:opacity-70"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input
              className="input flex-1 font-mono"
              value={launchArgInput}
              onChange={(e) => setLaunchArgInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addLaunchArg(); } }}
              placeholder="--load-extension=/data/extensions/ublock"
            />
            <button type="button" onClick={addLaunchArg} className="btn-secondary text-xs">
              添加
            </button>
          </div>
        </details>

        {/* Notes */}
        <section>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">备注</h3>
          <textarea
            className="input min-h-[80px] resize-y"
            value={form.notes ?? ""}
            onChange={(e) => set("notes", e.target.value || null)}
            placeholder="记录账号用途、负责人、注意事项..."
          />
        </section>
      </div>

    </form>
  );
}
