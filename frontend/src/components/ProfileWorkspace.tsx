import { Copy, ExternalLink, Play, Plus, Search, Square } from "lucide-react";
import { useMemo, useState } from "react";
import type { Profile } from "../lib/api";
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

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
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

  const groups = useMemo(() => {
    const names = new Set(profiles.map((p) => p.group_name || "Default"));
    return ["all", ...Array.from(names).sort((a, b) => a.localeCompare(b))];
  }, [profiles]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return profiles.filter((p) => {
      if (group !== "all" && (p.group_name || "Default") !== group) return false;
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

  return (
    <div className="h-full flex flex-col">
      <div className="px-5 py-4 border-b border-border bg-surface-0">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-semibold">Account Workspace</h2>
            <p className="text-xs text-gray-500 mt-1">
              {profiles.length} profiles / {profiles.filter((p) => p.status === "running").length} running
            </p>
          </div>
          <button onClick={onNew} className="btn-primary flex items-center gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            <span>New Profile</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-8"
              placeholder="Search name, group, account, proxy, tag..."
            />
          </div>
          <select value={group} onChange={(e) => setGroup(e.target.value)} className="input max-w-[180px]">
            {groups.map((g) => (
              <option key={g} value={g}>
                {g === "all" ? "All groups" : g}
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
            <span>Launch</span>
          </button>
          <button
            type="button"
            onClick={() => onBatchStop(selectedBatchIds)}
            disabled={selectedBatchIds.length === 0}
            className="btn-secondary flex items-center gap-1.5 disabled:opacity-40"
          >
            <Square className="h-3.5 w-3.5" />
            <span>Stop</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full min-w-[980px] text-sm">
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
              <th className="px-3 py-3 font-medium">Profile</th>
              <th className="px-3 py-3 font-medium">Account</th>
              <th className="px-3 py-3 font-medium">Group</th>
              <th className="px-3 py-3 font-medium">Proxy</th>
              <th className="px-3 py-3 font-medium">Fingerprint</th>
              <th className="px-3 py-3 font-medium">Last Launch</th>
              <th className="px-3 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
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
                  <div className="text-xs text-gray-500 capitalize">{profile.platform}</div>
                </td>
                <td className="px-3 py-3">
                  <div className="text-gray-300 truncate max-w-[190px]">
                    {profile.account_username || "-"}
                  </div>
                  <div className="text-xs text-gray-500 truncate max-w-[190px]">
                    {profile.account_platform || profile.home_url || ""}
                  </div>
                </td>
                <td className="px-3 py-3">
                  <span className="rounded bg-surface-3 px-2 py-1 text-xs text-gray-300">
                    {profile.group_name || "Default"}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <span className={profile.proxy ? "text-gray-300" : "text-gray-600"}>
                    {profile.proxy ? "Configured" : "None"}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <div className="font-mono text-xs text-gray-400">{profile.fingerprint_seed}</div>
                  <div className="text-xs text-gray-600">
                    {profile.screen_width}x{profile.screen_height}
                  </div>
                </td>
                <td className="px-3 py-3 text-gray-400">{formatDate(profile.last_launched_at)}</td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2">
                    <StatusIndicator status={profile.status} />
                    <span className="capitalize text-gray-300">{profile.status}</span>
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
                        title="Open home URL"
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
                      title="Clone profile"
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
                        <span>Stop</span>
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
                        <span>Launch</span>
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
            {profiles.length === 0 ? "Create your first account profile" : "No profiles match your filters"}
          </div>
        )}
      </div>
    </div>
  );
}
