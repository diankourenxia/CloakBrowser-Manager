import { Copy, ExternalLink, Play, Plus, Search, Square } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Profile } from "../lib/api";
import { ProfileEmbeddedViewer } from "./ProfileEmbeddedViewer";
import { StatusIndicator } from "./StatusIndicator";

interface ProfileWorkspaceProps {
  profiles: Profile[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onLaunch: (id: string) => Promise<void>;
  onStop: (id: string) => Promise<void>;
  onBatchLaunch: (ids: string[]) => Promise<void>;
  onBatchStop: (ids: string[]) => Promise<void>;
  onClone: (id: string) => Promise<void>;
}

export function ProfileWorkspace({
  profiles,
  selectedId,
  onSelect,
  onNew,
  onLaunch,
  onStop,
  onBatchLaunch,
  onBatchStop,
  onClone,
}: ProfileWorkspaceProps) {
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("all");
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [activeRunId, setActiveRunId] = useState<string | null>(null);

  const groups = useMemo(() => {
    const names = new Set(profiles.map((p) => p.group_name || "默认"));
    return ["all", ...Array.from(names).sort((a, b) => a.localeCompare(b))];
  }, [profiles]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return profiles.filter((p) => {
      if (group !== "all" && (p.group_name || "默认") !== group) return false;
      if (!q) return true;
      return [
        p.name,
        p.group_name,
        p.account_platform,
        p.account_username,
        p.home_url,
        p.proxy,
        ...p.tags.map((t) => t.tag),
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [group, profiles, search]);

  const visibleIds = filtered.map((p) => p.id);
  const runningProfiles = filtered.filter((p) => p.status === "running");
  const previewProfiles = runningProfiles.filter((p) => p.display !== "native");
  const nativeProfiles = runningProfiles.filter((p) => p.display === "native");
  const activePreview = previewProfiles.find((p) => p.id === activeRunId) ?? previewProfiles[0] ?? null;
  const selectedVisibleCount = visibleIds.filter((id) => checkedIds.has(id)).length;
  const selectedBatchIds = Array.from(checkedIds).filter((id) =>
    profiles.some((p) => p.id === id),
  );

  const toggleAllVisible = () => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      const allSelected = visibleIds.length > 0 && visibleIds.every((id) => next.has(id));
      visibleIds.forEach((id) => {
        if (allSelected) next.delete(id);
        else next.add(id);
      });
      return next;
    });
  };

  const toggleOne = (id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  useEffect(() => {
    if (previewProfiles.length === 0) {
      if (activeRunId) setActiveRunId(null);
      return;
    }
    if (!activeRunId || !previewProfiles.some((profile) => profile.id === activeRunId)) {
      setActiveRunId(previewProfiles[0]?.id ?? null);
    }
  }, [activeRunId, previewProfiles]);

  return (
    <div className="h-full flex flex-col">
      <div className="px-5 py-4 border-b border-border bg-surface-0">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-semibold">账号管理</h2>
            <p className="text-xs text-gray-500 mt-1">
              {profiles.length} 个账号 / {profiles.filter((p) => p.status === "running").length} 个运行中
            </p>
          </div>
          <button onClick={onNew} className="btn-primary flex items-center gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            <span>新建账号</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-8"
              placeholder="搜索账号、分组、平台..."
            />
          </div>
          <select value={group} onChange={(e) => setGroup(e.target.value)} className="input max-w-[180px]">
            {groups.map((g) => (
              <option key={g} value={g}>
                {g === "all" ? "全部分组" : g}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => onBatchLaunch(selectedBatchIds)}
            disabled={selectedBatchIds.length === 0}
            className="btn-secondary flex items-center gap-1.5 disabled:opacity-40"
          >
            <Play className="h-3.5 w-3.5" />
            <span>启动</span>
          </button>
          <button
            type="button"
            onClick={() => onBatchStop(selectedBatchIds)}
            disabled={selectedBatchIds.length === 0}
            className="btn-secondary flex items-center gap-1.5 disabled:opacity-40"
          >
            <Square className="h-3.5 w-3.5" />
            <span>停止</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {nativeProfiles.length > 0 && (
          <section className="border-b border-border bg-surface-0 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-gray-200">已打开浏览器窗口</h3>
              <span className="text-xs text-gray-500">{nativeProfiles.length} 个运行中</span>
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2">
              {nativeProfiles.map((profile) => (
                <div
                  key={profile.id}
                  onClick={() => onSelect(profile.id)}
                  className={`flex cursor-pointer items-center justify-between gap-2 rounded-md border bg-surface-1 px-3 py-2 text-left ${
                    selectedId === profile.id ? "border-accent/70" : "border-border"
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <StatusIndicator status={profile.status} />
                    <span className="truncate text-sm font-medium text-gray-100">{profile.name}</span>
                  </span>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onStop(profile.id);
                    }}
                    className="p-1 text-gray-500 hover:text-gray-200"
                    title="停止"
                  >
                    <Square className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {previewProfiles.length > 0 && (
          <section className="border-b border-border bg-surface-0 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-gray-200">浏览器标签</h3>
              <span className="text-xs text-gray-500">{previewProfiles.length} 个运行中</span>
            </div>
            <div className="flex gap-1 overflow-x-auto border-b border-border">
              {previewProfiles.map((profile) => (
                <div
                  key={profile.id}
                  className={`mb-[-1px] flex min-w-[160px] max-w-[220px] items-center gap-1 rounded-t-md border px-2 py-1.5 ${
                    activePreview?.id === profile.id
                      ? "border-border border-b-surface-1 bg-surface-1"
                      : "border-transparent bg-surface-2 text-gray-500"
                  }`}
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    onClick={() => {
                      setActiveRunId(profile.id);
                      onSelect(profile.id);
                    }}
                  >
                    <StatusIndicator status={profile.status} />
                    <span className="truncate text-sm font-medium text-gray-100">{profile.name}</span>
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onStop(profile.id);
                    }}
                    className="p-1 text-gray-500 hover:text-gray-200"
                    title="停止"
                  >
                    <Square className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
            {activePreview && (
              <ProfileEmbeddedViewer
                key={activePreview.id}
                profileId={activePreview.id}
                className="h-[min(64vh,720px)] min-h-[420px] rounded-b-md border-x border-b border-border"
                lazy={false}
              />
            )}
          </section>
        )}

        <table className="w-full min-w-[760px] text-sm">
          <thead className="sticky top-0 bg-surface-1 border-b border-border z-10">
            <tr className="text-left text-xs text-gray-500">
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={visibleIds.length > 0 && selectedVisibleCount === visibleIds.length}
                  onChange={toggleAllVisible}
                  className="rounded border-border bg-surface-2"
                />
              </th>
              <th className="px-3 py-3 font-medium">账号</th>
              <th className="px-3 py-3 font-medium">分组</th>
              <th className="px-3 py-3 font-medium">代理</th>
              <th className="px-3 py-3 font-medium">状态</th>
              <th className="px-4 py-3 font-medium text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((profile) => (
              <tr
                key={profile.id}
                onClick={() => onSelect(profile.id)}
                className={`border-b border-border/70 cursor-pointer hover:bg-surface-2 ${
                  selectedId === profile.id ? "bg-surface-3/80" : ""
                }`}
              >
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={checkedIds.has(profile.id)}
                    onChange={() => toggleOne(profile.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="rounded border-border bg-surface-2"
                  />
                </td>
                <td className="px-3 py-3">
                  <div className="font-medium text-gray-100 truncate max-w-[210px]">{profile.name}</div>
                  <div className="text-xs text-gray-500 truncate max-w-[260px]">
                    {[profile.account_platform, profile.account_username].filter(Boolean).join(" / ") || "未填写账号信息"}
                  </div>
                </td>
                <td className="px-3 py-3">
                  <span className="rounded bg-surface-3 px-2 py-1 text-xs text-gray-300">
                    {profile.group_name || "默认"}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <span className={profile.proxy ? "text-gray-300" : "text-gray-600"}>
                    {profile.proxy ? "已配置" : "未设置"}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2">
                    <StatusIndicator status={profile.status} />
                    <span className="text-gray-300">{profile.status === "running" ? "运行中" : "未启动"}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    {profile.home_url && (
                      <a
                        href={profile.home_url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="p-1.5 text-gray-500 hover:text-gray-200"
                        title="打开首页"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onClone(profile.id);
                      }}
                      className="p-1.5 text-gray-500 hover:text-gray-200"
                      title="复制账号"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    {profile.status === "running" ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onStop(profile.id);
                        }}
                        className="btn-secondary flex items-center gap-1.5"
                      >
                        <Square className="h-3.5 w-3.5" />
                        <span>停止</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onLaunch(profile.id);
                        }}
                        className="btn-primary flex items-center gap-1.5"
                      >
                        <Play className="h-3.5 w-3.5" />
                        <span>启动</span>
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div className="h-64 flex items-center justify-center text-sm text-gray-500">
            {profiles.length === 0 ? "先新建一个账号" : "没有匹配的账号"}
          </div>
        )}
      </div>
    </div>
  );
}
