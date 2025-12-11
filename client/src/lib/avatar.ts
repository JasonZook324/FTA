export async function resolveAvatarUrl(params: {
  avatarUrl: string | null | undefined;
  avatarProvider: string | null | undefined;
  avatarVersion?: number | string;
}): Promise<string | undefined> {
  const { avatarUrl, avatarProvider, avatarVersion = 0 } = params;
  if (!avatarUrl) return undefined;
  if (avatarProvider && avatarProvider !== "preset") {
    try {
      const res = await fetch("/api/account/avatar/url", { credentials: "include" });
      if (!res.ok) return undefined;
      const data = await res.json();
      return data.signedUrl || undefined;
    } catch {
      return undefined;
    }
  }
  return `${avatarUrl}?v=${avatarVersion}`;
}
