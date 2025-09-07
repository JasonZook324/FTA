import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ArrowLeft, ArrowRight, Shield, Info } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const emailSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

const passwordSchema = z.object({
  password: z.string().min(1, "Password is required"),
});

const leagueSelectionSchema = z.object({
  leagueId: z.string().min(1, "Please select a league"),
});

type EmailFormData = z.infer<typeof emailSchema>;
type PasswordFormData = z.infer<typeof passwordSchema>;
type LeagueSelectionData = z.infer<typeof leagueSelectionSchema>;

interface League {
  id: string;
  name: string;
  sport: string;
  season: number;
}

interface EspnLoginModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

type LoginStep = "email" | "password" | "leagues" | "success";

export function EspnLoginModal({ open, onOpenChange, onSuccess }: EspnLoginModalProps) {
  const [currentStep, setCurrentStep] = useState<LoginStep>("email");
  const [loginData, setLoginData] = useState({ email: "", password: "" });
  const [availableLeagues, setAvailableLeagues] = useState<League[]>([]);
  const { toast } = useToast();

  const emailForm = useForm<EmailFormData>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: "" },
  });

  const passwordForm = useForm<PasswordFormData>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { password: "" },
  });

  const leagueForm = useForm<LeagueSelectionData>({
    resolver: zodResolver(leagueSelectionSchema),
    defaultValues: { leagueId: "" },
  });

  // Step 1: Submit email
  const emailMutation = useMutation({
    mutationFn: async (data: EmailFormData) => {
      const response = await apiRequest("POST", "/api/auth/espn/email", data);
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        setLoginData(prev => ({ ...prev, email: emailForm.getValues("email") }));
        setCurrentStep("password");
      } else {
        toast({
          title: "Email Error",
          description: data.message || "Failed to verify email",
          variant: "destructive",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Step 2: Submit password
  const passwordMutation = useMutation({
    mutationFn: async (data: PasswordFormData) => {
      const response = await apiRequest("POST", "/api/auth/espn/password", {
        email: loginData.email,
        password: data.password,
      });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success && data.leagues) {
        setLoginData(prev => ({ ...prev, password: passwordForm.getValues("password") }));
        setAvailableLeagues(data.leagues);
        setCurrentStep("leagues");
      } else {
        toast({
          title: "Authentication Failed",
          description: data.message || "Invalid email or password",
          variant: "destructive",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Step 3: Select league and complete login
  const leagueMutation = useMutation({
    mutationFn: async (data: LeagueSelectionData) => {
      const response = await apiRequest("POST", "/api/auth/espn/complete", {
        email: loginData.email,
        password: loginData.password,
        leagueId: data.leagueId,
      });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        setCurrentStep("success");
        toast({
          title: "Success",
          description: "Successfully signed in to ESPN Fantasy!",
        });
        queryClient.invalidateQueries({ queryKey: ["/api/espn-credentials"] });
        setTimeout(() => {
          onOpenChange(false);
          onSuccess?.();
          resetForms();
        }, 2000);
      } else {
        toast({
          title: "Login Failed",
          description: data.message || "Failed to complete login",
          variant: "destructive",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const resetForms = () => {
    setCurrentStep("email");
    setLoginData({ email: "", password: "" });
    setAvailableLeagues([]);
    emailForm.reset();
    passwordForm.reset();
    leagueForm.reset();
  };

  const handleClose = () => {
    onOpenChange(false);
    resetForms();
  };

  const renderEmailStep = () => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Sign in to ESPN
        </CardTitle>
        <CardDescription>
          Enter your ESPN account email to get started
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...emailForm}>
          <form onSubmit={emailForm.handleSubmit((data) => emailMutation.mutate(data))} className="space-y-4">
            <FormField
              control={emailForm.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email Address</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="your-email@example.com"
                      {...field}
                      data-testid="input-email"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button
              type="submit"
              className="w-full"
              disabled={emailMutation.isPending}
              data-testid="button-submit-email"
            >
              {emailMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verifying...
                </>
              ) : (
                <>
                  Continue
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );

  const renderPasswordStep = () => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Enter Password
        </CardTitle>
        <CardDescription>
          Welcome back, {loginData.email}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...passwordForm}>
          <form onSubmit={passwordForm.handleSubmit((data) => passwordMutation.mutate(data))} className="space-y-4">
            <FormField
              control={passwordForm.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder="Enter your password"
                      {...field}
                      data-testid="input-password"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCurrentStep("email")}
                className="flex-1"
                data-testid="button-back-to-email"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button
                type="submit"
                className="flex-1"
                disabled={passwordMutation.isPending}
                data-testid="button-submit-password"
              >
                {passwordMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  <>
                    Sign In
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );

  const renderLeagueStep = () => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Select Your League
        </CardTitle>
        <CardDescription>
          Choose which fantasy league you'd like to access
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...leagueForm}>
          <form onSubmit={leagueForm.handleSubmit((data) => leagueMutation.mutate(data))} className="space-y-4">
            <FormField
              control={leagueForm.control}
              name="leagueId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Available Leagues</FormLabel>
                  <FormControl>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger data-testid="select-league">
                        <SelectValue placeholder="Select a league..." />
                      </SelectTrigger>
                      <SelectContent>
                        {availableLeagues.map((league) => (
                          <SelectItem key={league.id} value={league.id}>
                            <div className="flex flex-col">
                              <span className="font-medium">{league.name}</span>
                              <span className="text-xs text-muted-foreground">
                                {league.sport.toUpperCase()} • {league.season}
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCurrentStep("password")}
                className="flex-1"
                data-testid="button-back-to-password"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button
                type="submit"
                className="flex-1"
                disabled={leagueMutation.isPending}
                data-testid="button-complete-login"
              >
                {leagueMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Completing...
                  </>
                ) : (
                  "Complete Setup"
                )}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );

  const renderSuccessStep = () => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-green-600">
          <Shield className="h-5 w-5" />
          Login Successful!
        </CardTitle>
        <CardDescription>
          Your ESPN Fantasy account has been connected successfully.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-center py-6">
          <div className="text-green-600 text-4xl mb-4">✓</div>
          <p className="text-sm text-muted-foreground">
            Redirecting to your fantasy dashboard...
          </p>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md" data-testid="espn-login-modal">
        <DialogHeader>
          <DialogTitle>ESPN Fantasy Login</DialogTitle>
          <DialogDescription>
            Securely connect your ESPN Fantasy account to access your leagues
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4">
          {currentStep === "email" && renderEmailStep()}
          {currentStep === "password" && renderPasswordStep()}
          {currentStep === "leagues" && renderLeagueStep()}
          {currentStep === "success" && renderSuccessStep()}
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground p-4 bg-muted rounded-lg">
          <Info className="h-4 w-4" />
          <span>
            Your login credentials are encrypted and only used to authenticate with ESPN's servers.
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}