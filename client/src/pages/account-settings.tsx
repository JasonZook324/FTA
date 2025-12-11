import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";
import { formatApiError } from "@/lib/error";
import * as React from "react";
import * as Avatar from "@radix-ui/react-avatar";

export default function AccountSettings() {
  const { user } = useAuth();
  const { toast } = useToast();

  // Username state
  const [username, setUsername] = useState(user?.username || "");
  // Email state
  const [email, setEmail] = useState((user as any)?.email || "");
  const [emailVerified, setEmailVerified] = useState<boolean | null>(null);
  // Password state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Avatar state
  // Derive avatar directly from auth user to avoid double updates
  const avatarUrl = (user as any)?.avatarUrl ?? null;
  const avatarVersion = (user as any)?.avatarUpdatedAt ?? 0;
  const [displayedSrc, setDisplayedSrc] = React.useState<string | undefined>(
    avatarUrl ? `${avatarUrl}?v=${avatarVersion}` : undefined
  );
  React.useEffect(() => {
    const next = avatarUrl ? `${avatarUrl}?v=${avatarVersion}` : undefined;
    if (!next) { setDisplayedSrc(undefined); return; }
    const img = new Image();
    img.onload = () => setDisplayedSrc(next);
    img.src = next;
  }, [avatarUrl, avatarVersion]);
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const uploadsEnabled = (import.meta.env.VITE_ENABLE_AVATAR_UPLOAD === 'true');
  const presets = React.useMemo(() => [
    { id: "robot", label: "Robot" },
    { id: "helmet", label: "Helmet" },
    { id: "star", label: "Star" },
    { id: "shield", label: "Shield" },
  ], []);

  useEffect(() => {
    setUsername(user?.username || "");
    setEmail((user as any)?.email || "");
  }, [user]);

  // No local avatar state; preview updates when auth user changes

  useEffect(() => {
    let ignore = false;
    async function fetchStatus() {
      try {
        const res = await fetch("/api/email-verification-status", { credentials: "include" });
        if (!res.ok) {
          setEmailVerified(null);
          return;
        }
        const data = await res.json();
        if (!ignore) setEmailVerified(!!data.verified);
      } catch {
        if (!ignore) setEmailVerified(null);
      }
    }
    if ((user as any)?.email) fetchStatus();
    return () => { ignore = true; };
  }, [user?.id, (user as any)?.email]);

  async function saveProfile(field: "username" | "email") {
    try {
      const payload: any = {};
      if (field === "username") payload.username = username.trim();
      if (field === "email") payload.email = email.trim().toLowerCase();

      const res = await apiRequest("PATCH", "/api/account/profile", payload);
      const updated = await res.json();
      queryClient.setQueryData(["/api/user"], updated);

      if (field === "email") {
        toast({
          title: "Email updated",
          description: "Please verify your new email address via the link sent to your inbox.",
        });
        // refresh status
        setEmailVerified(false);
      } else {
        toast({ title: "Username updated", description: "Your username has been saved." });
      }
    } catch (e: any) {
      const friendly = formatApiError(e, {
        defaultMessage: "Unable to update account. Please try again.",
      });
      toast({ title: "Update failed", description: friendly, variant: "destructive" });
    }
  }

  async function resendVerification() {
    try {
      const res = await apiRequest("POST", "/api/resend-verification");
      await res.json();
      toast({ title: "Verification sent", description: "Check your inbox and spam folder." });
    } catch (e: any) {
      toast({ title: "Failed to resend", description: e.message || "Please try again later.", variant: "destructive" });
    }
  }

  async function changePassword() {
    try {
      if (newPassword.length < 6) {
        toast({ title: "Weak password", description: "Use at least 6 characters.", variant: "destructive" });
        return;
      }
      if (newPassword !== confirmPassword) {
        toast({ title: "Mismatch", description: "New passwords do not match.", variant: "destructive" });
        return;
      }
      await apiRequest("PATCH", "/api/account/password", { currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast({ title: "Password changed", description: "Your password has been updated." });
    } catch (e: any) {
      const friendly = formatApiError(e, {
        defaultMessage: "Unable to change password. Please try again.",
      });
      toast({ title: "Update failed", description: friendly, variant: "destructive" });
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-4 space-y-6">
      <h1 className="text-2xl font-bold">Account Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Username</label>
            <div className="flex gap-2">
              <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Your username" />
              <Button onClick={() => saveProfile("username")}>Save</Button>
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <label className="text-sm font-medium">Email</label>
            <div className="flex gap-2">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
              <Button onClick={() => saveProfile("email")}>Save</Button>
            </div>
            {(user as any)?.email && (
              <div className="text-xs text-muted-foreground flex items-center gap-2">
                <span>Status: {emailVerified === true ? "Verified" : emailVerified === false ? "Not verified" : "Unknown"}</span>
                <Button variant="secondary" size="sm" onClick={resendVerification}>Resend verification</Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Avatar</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Avatar.Root className="inline-flex h-16 w-16 select-none items-center justify-center overflow-hidden rounded-full align-middle border">
              <Avatar.Image
                src={displayedSrc}
                alt={user?.username ?? "avatar"}
                className="h-full w-full object-cover"
              />
              <Avatar.Fallback delayMs={250} className="flex h-full w-full items-center justify-center bg-muted text-lg">
                {(user?.username || "U").slice(0, 1).toUpperCase()}
              </Avatar.Fallback>
            </Avatar.Root>
            <div className="text-sm text-muted-foreground">
              Choose a preset or upload a custom image (PNG/JPG/WebP, max ~1MB).
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <label className="text-sm font-medium">Presets</label>
            <div className="flex flex-wrap gap-3">
              {presets.map((p) => (
                <Button key={p.id} variant="secondary" size="sm" onClick={async () => {
                  try {
                    const res = await apiRequest("PATCH", "/api/account/avatar", { presetId: p.id });
                    const updated = await res.json();
                    queryClient.setQueryData(["/api/user"], updated);
                    queryClient.invalidateQueries({ queryKey: ["/api/user"] });
                    // Explicit refetch to ensure global auth state updates immediately
                    try {
                      const userRes = await fetch("/api/user", { credentials: "include" });
                      if (userRes.ok) {
                        const fresh = await userRes.json();
                        queryClient.setQueryData(["/api/user"], fresh);
                      }
                    } catch {}
                    toast({ title: "Avatar updated", description: `Preset set to ${p.label}.` });
                  } catch (e: any) {
                    const friendly = formatApiError(e, { defaultMessage: "Unable to update avatar." });
                    toast({ title: "Update failed", description: friendly, variant: "destructive" });
                  }
                }}>
                  {p.label}
                </Button>
              ))}
            </div>
          </div>

          {uploadsEnabled && (
            <>
              <Separator />
              <div className="space-y-2">
                <label className="text-sm font-medium">Upload custom</label>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => {
                    const f = e.target.files?.[0] || null;
                    setFile(f);
                  }}
                />
                <div>
                  <Button disabled={!file || uploading} onClick={async () => {
                    if (!file) return;
                    if (file.size > 1_000_000) { // ~1MB limit
                      toast({ title: "File too large", description: "Please choose an image under 1MB.", variant: "destructive" });
                      return;
                    }
                    const ct = file.type;
                    const ext = ct === "image/png" ? "png" : ct === "image/webp" ? "webp" : "jpg";
                    setUploading(true);
                    try {
                      const presignRes = await apiRequest("POST", "/api/account/avatar/presign", { contentType: ct, ext });
                      const { putUrl, publicUrl } = await presignRes.json();
                      const put = await fetch(putUrl, { method: "PUT", headers: { "Content-Type": ct }, body: file });
                      if (!put.ok) throw new Error(`Upload failed (${put.status})`);
                      const finalizeRes = await apiRequest("PATCH", "/api/account/avatar", { publicUrl });
                      const updated = await finalizeRes.json();
                      queryClient.setQueryData(["/api/user"], updated);
                      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
                      try {
                        const userRes = await fetch("/api/user", { credentials: "include" });
                        if (userRes.ok) {
                          const fresh = await userRes.json();
                          queryClient.setQueryData(["/api/user"], fresh);
                        }
                      } catch {}
                      toast({ title: "Avatar uploaded", description: "Your avatar has been updated." });
                    } catch (e: any) {
                      const friendly = formatApiError(e, { defaultMessage: "Unable to upload avatar." });
                      toast({ title: "Upload failed", description: friendly, variant: "destructive" });
                    } finally {
                      setUploading(false);
                    }
                  }}>
                    {uploading ? "Uploading..." : "Upload & Save"}
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Change Password</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <label className="text-sm font-medium">Current password</label>
            <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">New password</label>
            <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Confirm new password</label>
            <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
          </div>
          <div>
            <Button onClick={changePassword}>Update Password</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
