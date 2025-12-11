import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Activity, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { formatApiError } from "@/lib/error";

const resetPasswordSchema = z.object({
  password: z.string().min(6, "Password must be at least 6 characters"),
  confirmPassword: z.string().min(6, "Password must be at least 6 characters"),
}).refine((data) => data.password === data.confirmPassword, {
  path: ["confirmPassword"],
  message: "Passwords do not match",
});

type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>;

export default function ResetPasswordPage() {
  const [location, setLocation] = useLocation();
  const [token, setToken] = useState<string | null>(null);
  const [isVerifyingToken, setIsVerifyingToken] = useState(true);
  const [isValidToken, setIsValidToken] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);
  const { toast } = useToast();

  const form = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
  });

  // Extract token from URL and verify it
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenParam = params.get("token");

    if (!tokenParam) {
      setIsVerifyingToken(false);
      setIsValidToken(false);
      return;
    }

    setToken(tokenParam);

    // Verify the token
    fetch(`/api/verify-reset-token?token=${encodeURIComponent(tokenParam)}`)
      .then((response) => response.json())
      .then((data) => {
        setIsValidToken(data.success);
      })
      .catch((error) => {
        console.error("Error verifying token:", error);
        setIsValidToken(false);
      })
      .finally(() => {
        setIsVerifyingToken(false);
      });
  }, [location]);

  const resetPasswordMutation = useMutation({
    mutationFn: async (data: ResetPasswordFormData) => {
      const response = await fetch("/api/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          newPassword: data.password,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Failed to reset password");
      }

      return result;
    },
    onSuccess: () => {
      setResetSuccess(true);
      toast({
        title: "Success!",
        description: "Your password has been reset successfully.",
      });

      // Redirect to login after 3 seconds
      setTimeout(() => {
        setLocation("/auth");
      }, 3000);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: formatApiError(error, { defaultMessage: "We couldn't reset your password. Please try again." }),
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ResetPasswordFormData) => {
    resetPasswordMutation.mutate(data);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-8 bg-gradient-to-br from-primary/5 to-primary/10">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2 mb-8 justify-center">
          <Activity className="h-8 w-8 text-primary" />
          <h1 className="text-2xl font-bold">Fantasy Toolbox AI</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Reset Password</CardTitle>
            <CardDescription>
              {isVerifyingToken
                ? "Verifying your reset link..."
                : isValidToken
                ? "Enter your new password below"
                : "Invalid or expired reset link"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isVerifyingToken ? (
              <div className="flex flex-col items-center gap-4 py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Verifying reset link...</p>
              </div>
            ) : !isValidToken ? (
              <div className="flex flex-col items-center gap-4 py-8">
                <div className="rounded-full bg-destructive/10 p-3">
                  <XCircle className="h-8 w-8 text-destructive" />
                </div>
                <div className="text-center space-y-2">
                  <h3 className="font-semibold">Invalid Reset Link</h3>
                  <p className="text-sm text-muted-foreground">
                    This password reset link is invalid or has expired. Please request a new one.
                  </p>
                </div>
                <Button onClick={() => setLocation("/auth")} className="w-full mt-4">
                  Back to Login
                </Button>
              </div>
            ) : resetSuccess ? (
              <div className="flex flex-col items-center gap-4 py-8">
                <div className="rounded-full bg-primary/10 p-3">
                  <CheckCircle2 className="h-8 w-8 text-primary" />
                </div>
                <div className="text-center space-y-2">
                  <h3 className="font-semibold">Password Reset Successful!</h3>
                  <p className="text-sm text-muted-foreground">
                    Your password has been reset successfully. Redirecting to login...
                  </p>
                </div>
              </div>
            ) : (
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="password">New Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Enter new password"
                    {...form.register("password")}
                    disabled={resetPasswordMutation.isPending}
                  />
                  {form.formState.errors.password && (
                    <p className="text-sm text-destructive">
                      {form.formState.errors.password.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm New Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="Re-enter new password"
                    {...form.register("confirmPassword")}
                    disabled={resetPasswordMutation.isPending}
                  />
                  {form.formState.errors.confirmPassword && (
                    <p className="text-sm text-destructive">
                      {form.formState.errors.confirmPassword.message}
                    </p>
                  )}
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={resetPasswordMutation.isPending}
                >
                  {resetPasswordMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Resetting Password...
                    </>
                  ) : (
                    "Reset Password"
                  )}
                </Button>

                <p className="text-xs text-center text-muted-foreground">
                  Remember your password?{" "}
                  <Button
                    type="button"
                    variant="link"
                    className="p-0 h-auto font-normal text-xs"
                    onClick={() => setLocation("/auth")}
                  >
                    Back to login
                  </Button>
                </p>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
