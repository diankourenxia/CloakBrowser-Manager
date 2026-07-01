import { useCallback, useEffect, useState } from "react";
import { api, type Profile, type ProfileCreateData } from "../lib/api";

export function useProfiles() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await api.listProfiles();
      setProfiles(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载账号失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    // Poll for status changes every 3 seconds.
    const interval = setInterval(refresh, 3000);
    return () => clearInterval(interval);
  }, [refresh]);

  const create = useCallback(
    async (data: ProfileCreateData): Promise<Profile | undefined> => {
      try {
        const profile = await api.createProfile(data);
        setProfiles((prev) => [profile, ...prev]);
        return profile;
      } catch (err) {
        setError(err instanceof Error ? err.message : "创建账号失败");
      }
    },
    [],
  );

  const update = useCallback(
    async (id: string, data: Partial<ProfileCreateData>) => {
      try {
        const profile = await api.updateProfile(id, data);
        setProfiles((prev) => prev.map((p) => (p.id === id ? profile : p)));
        return profile;
      } catch (err) {
        setError(err instanceof Error ? err.message : "保存账号失败");
      }
    },
    [],
  );

  const remove = useCallback(
    async (id: string) => {
      try {
        await api.deleteProfile(id);
        setProfiles((prev) => prev.filter((p) => p.id !== id));
      } catch (err) {
        setError(err instanceof Error ? err.message : "删除账号失败");
      }
    },
    [],
  );

  const clone = useCallback(
    async (id: string, name?: string): Promise<Profile | undefined> => {
      try {
        const profile = await api.cloneProfile(id, name);
        setProfiles((prev) => [profile, ...prev]);
        return profile;
      } catch (err) {
        setError(err instanceof Error ? err.message : "复制账号失败");
      }
    },
    [],
  );

  const launch = useCallback(
    async (id: string) => {
      try {
        const result = await api.launchProfile(id);
        await refresh();
        return result;
      } catch (err) {
        setError(err instanceof Error ? err.message : "启动账号失败");
      }
    },
    [refresh],
  );

  const stop = useCallback(
    async (id: string) => {
      try {
        await api.stopProfile(id);
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "停止账号失败");
      }
    },
    [refresh],
  );

  const batchLaunch = useCallback(
    async (ids: string[]) => {
      try {
        const results = await api.batchLaunchProfiles(ids);
        await refresh();
        const failed = results.filter((r) => !r.ok);
        if (failed.length > 0) {
          setError(`${failed.length} 个账号启动失败`);
        }
        return results;
      } catch (err) {
        setError(err instanceof Error ? err.message : "批量启动失败");
      }
    },
    [refresh],
  );

  const batchStop = useCallback(
    async (ids: string[]) => {
      try {
        const results = await api.batchStopProfiles(ids);
        await refresh();
        return results;
      } catch (err) {
        setError(err instanceof Error ? err.message : "批量停止失败");
      }
    },
    [refresh],
  );

  return {
    profiles,
    loading,
    error,
    refresh,
    create,
    update,
    remove,
    clone,
    launch,
    stop,
    batchLaunch,
    batchStop,
  };
}
