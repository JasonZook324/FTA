import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";

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

  useEffect(() => {
    setUsername(user?.username || "");
    setEmail((user as any)?.email || "");
  }, [user]);

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
      const friendly = (() => {
        const raw = e?.message ? String(e.message) : String(e);
        const idx = raw.indexOf(":");
        const after = idx >= 0 ? raw.slice(idx + 1).trim() : raw;
        if (/failed to fetch|network error|networkrequestfailed/i.test(after)) {
          return "We couldn't reach the server. Please check your connection and try again.";
        }
        try {
          const parsed = JSON.parse(after);
          if (parsed && typeof parsed === "object" && "message" in parsed) {
            return String(parsed.message);
          }
        } catch {}
        const match = after.match(/"message"\s*:\s*"([^"]+)"/);
        if (match) return match[1];
        if (/email/i.test(after) && /invalid|format/.test(after)) return "Please enter a valid email address.";
        if (/email/i.test(after) && /exist|used|taken/.test(after)) return "That email is already in use.";
        if (/username/i.test(after) && /exist|used|taken/.test(after)) return "That username is already taken.";
        return "Unable to update account. Please try again.";
      })();
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
      const friendly = (() => {
        const raw = e?.message ? String(e.message) : String(e);
        const idx = raw.indexOf(":");
        const after = idx >= 0 ? raw.slice(idx + 1).trim() : raw;
        if (/failed to fetch|network error|networkrequestfailed/i.test(after)) {
          return "We couldn't reach the server. Please check your connection and try again.";
        }
        try {
          const parsed = JSON.parse(after);
          if (parsed && typeof parsed === "object" && "message" in parsed) {
            return String(parsed.message);
          }
        } catch {}
        const match = after.match(/"message"\s*:\s*"([^"]+)"/);
        if (match) return match[1];
        if (/incorrect/i.test(after)) return "Current password is incorrect";
        if (/required/i.test(after)) return "Current password is required";
        return "Unable to change password. Please try again.";
      })();
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
