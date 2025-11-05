// Reference: blueprint:javascript_auth_all_persistance
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ForgotPasswordDialog } from "@/components/forgot-password-dialog";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertUserSchema } from "@shared/schema";
import { z } from "zod";
import { Activity } from "lucide-react";
import { useEffect, useState } from "react";

const loginSchema = insertUserSchema.pick({ username: true, password: true });
// Require and validate email on registration; normalize to lowercase
// Add confirmPassword and ensure it matches password
const registerSchema = insertUserSchema
  .extend({
    email: z
      .string({ required_error: "Email is required" })
      .email("Please enter a valid email address")
      .transform((v) => v.trim().toLowerCase()),
    confirmPassword: z
      .string({ required_error: "Please confirm your password" })
      .min(6, "Password must be at least 6 characters"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });
type LoginFormData = z.infer<typeof loginSchema>;
type RegisterFormData = z.infer<typeof registerSchema>;

export default function AuthPage() {
  const { user, loginMutation, registerMutation } = useAuth();
  const [, setLocation] = useLocation();
  
  // Theme detection
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      const saved = localStorage.getItem('theme');
      if (saved === 'dark' || saved === 'light') {
        return saved;
      }
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });
  
  // Listen for theme changes
  useEffect(() => {
    const observer = new MutationObserver(() => {
      const isDark = document.documentElement.classList.contains('dark');
      setTheme(isDark ? 'dark' : 'light');
    });
    
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });
    
    return () => observer.disconnect();
  }, []);
  
  // Preload both banner images
  useEffect(() => {
    const lightImg = new Image();
    const darkImg = new Image();
    lightImg.src = '/banner_light.png';
    darkImg.src = '/banner_dark.png';
  }, []);

  const loginForm = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  const registerForm = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      username: "",
      password: "",
      confirmPassword: "",
      email: "",
    },
  });

  useEffect(() => {
    if (user) {
      setLocation("/");
    }
  }, [user, setLocation]);

  const handleLogin = (data: LoginFormData) => {
    loginMutation.mutate(data);
  };

  const handleRegister = (data: RegisterFormData) => {
    const { confirmPassword, ...payload } = data;
    // Do not send confirmPassword to the server
    registerMutation.mutate(payload as any);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <img 
            src={theme === 'light' ? '/banner_light.png' : '/banner_dark.png'}
            alt="Fantasy Toolbox AI" 
            className="h-64 w-auto transition-opacity duration-150"
            key={theme}
          />
        </div>

        <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login" data-testid="tab-login">Login</TabsTrigger>
              <TabsTrigger value="register" data-testid="tab-register">Register</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <Card>
                <CardHeader>
                  <CardTitle>Welcome back</CardTitle>
                  <CardDescription>
                    Log in to manage your Fantasy Toolbox AI leagues
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="login-username">Username or Email</Label>
                      <Input
                        id="login-username"
                        data-testid="input-login-username"
                        placeholder="Enter your username or email"
                        {...loginForm.register("username")}
                      />
                      {loginForm.formState.errors.username && (
                        <p className="text-sm text-destructive">
                          {loginForm.formState.errors.username.message}
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="login-password">Password</Label>
                        <ForgotPasswordDialog />
                      </div>
                      <Input
                        id="login-password"
                        data-testid="input-login-password"
                        type="password"
                        placeholder="Enter your password"
                        {...loginForm.register("password")}
                      />
                      {loginForm.formState.errors.password && (
                        <p className="text-sm text-destructive">
                          {loginForm.formState.errors.password.message}
                        </p>
                      )}
                    </div>
                    <Button
                      type="submit"
                      data-testid="button-login"
                      className="w-full"
                      disabled={loginMutation.isPending}
                    >
                      {loginMutation.isPending ? "Logging in..." : "Log in"}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="register">
              <Card>
                <CardHeader>
                  <CardTitle>Create an account</CardTitle>
                  <CardDescription>
                    Get started with Fantasy Toolbox AI
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={registerForm.handleSubmit(handleRegister)} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="register-email">Email</Label>
                      <Input
                        id="register-email"
                        data-testid="input-register-email"
                        type="email"
                        placeholder="you@example.com"
                        {...registerForm.register("email")}
                      />
                      {registerForm.formState.errors.email && (
                        <p className="text-sm text-destructive">
                          {registerForm.formState.errors.email.message as string}
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="register-username">Username</Label>
                      <Input
                        id="register-username"
                        data-testid="input-register-username"
                        placeholder="Choose a username"
                        {...registerForm.register("username")}
                      />
                      {registerForm.formState.errors.username && (
                        <p className="text-sm text-destructive">
                          {registerForm.formState.errors.username.message}
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="register-password">Password</Label>
                      <Input
                        id="register-password"
                        data-testid="input-register-password"
                        type="password"
                        placeholder="Choose a password"
                        {...registerForm.register("password")}
                      />
                      {registerForm.formState.errors.password && (
                        <p className="text-sm text-destructive">
                          {registerForm.formState.errors.password.message}
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="register-confirm-password">Confirm Password</Label>
                      <Input
                        id="register-confirm-password"
                        data-testid="input-register-confirm-password"
                        type="password"
                        placeholder="Re-enter your password"
                        {...registerForm.register("confirmPassword")}
                      />
                      {registerForm.formState.errors.confirmPassword && (
                        <p className="text-sm text-destructive">
                          {registerForm.formState.errors.confirmPassword.message as string}
                        </p>
                      )}
                    </div>
                    <Button
                      type="submit"
                      data-testid="button-register"
                      className="w-full"
                      disabled={registerMutation.isPending}
                    >
                      {registerMutation.isPending ? "Creating account..." : "Create account"}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Feature Card - moved below login/register */}
          <Card className="mt-8">
            <CardHeader>
              <CardTitle className="text-2xl">Fantasy Toolbox AI</CardTitle>
              <CardDescription className="text-base italic">Your Playbook Just Got Smarter</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="flex items-start gap-3 text-sm">
                <span className="text-primary mt-1">✓</span>
                <span>Connect your ESPN credentials and import all your leagues</span>
              </p>
              <p className="flex items-start gap-3 text-sm">
                <span className="text-primary mt-1">✓</span>
                <span>Get AI-powered recommendations and trade analysis</span>
              </p>
              <p className="flex items-start gap-3 text-sm">
                <span className="text-primary mt-1">✓</span>
                <span>Export waiver wire and roster data to CSV</span>
              </p>
              <p className="flex items-start gap-3 text-sm">
                <span className="text-primary mt-1">✓</span>
                <span>View detailed standings, matchups, and team rosters</span>
              </p>
            </CardContent>
          </Card>
        </div>
    </div>
  );
}
