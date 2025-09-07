import React, { useState } from "react";
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

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormData = z.infer<typeof loginSchema>;

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

type LoginStep = "login" | "success";

export function EspnLoginModal({ open, onOpenChange, onSuccess }: EspnLoginModalProps) {
  const [currentStep, setCurrentStep] = useState<LoginStep>("login");
  const [availableLeagues, setAvailableLeagues] = useState<League[]>([]);
  const { toast } = useToast();

  const loginForm = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  // Direct login mutation
  const loginMutation = useMutation({
    mutationFn: async (data: LoginFormData) => {
      const response = await apiRequest("POST", "/api/auth/espn/login", data);
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        setCurrentStep("success");
        if (data.leagues) {
          setAvailableLeagues(data.leagues);
        }
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

  const resetForms = () => {
    setCurrentStep("login");
    setAvailableLeagues([]);
    loginForm.reset();
  };

  const handleClose = () => {
    onOpenChange(false);
    resetForms();
  };

  const renderLoginStep = () => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Sign in to ESPN
        </CardTitle>
        <CardDescription>
          Enter your ESPN account credentials to connect your fantasy leagues
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...loginForm}>
          <form onSubmit={loginForm.handleSubmit((data) => loginMutation.mutate(data))} className="space-y-4">
            <FormField
              control={loginForm.control}
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
            <FormField
              control={loginForm.control}
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
            <Button
              type="submit"
              className="w-full"
              disabled={loginMutation.isPending}
              data-testid="button-login"
            >
              {loginMutation.isPending ? (
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
          <p className="text-sm text-muted-foreground mb-4">
            Authentication cookies captured and stored securely.
          </p>
          {availableLeagues.length > 0 && (
            <div className="text-xs text-muted-foreground">
              Found {availableLeagues.length} fantasy league{availableLeagues.length !== 1 ? 's' : ''}
            </div>
          )}
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
          {currentStep === "login" && renderLoginStep()}
          {currentStep === "success" && renderSuccessStep()}
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground p-4 bg-muted rounded-lg">
          <Info className="h-4 w-4" />
          <span>
            Development mode: Generates working test credentials for ESPN API access. 
            In production, this would authenticate directly with ESPN's servers.
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}