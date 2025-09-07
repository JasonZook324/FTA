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

const leagueSelectionSchema = z.object({
  leagueId: z.string().min(1, "Please select a league"),
});

type LoginFormData = z.infer<typeof loginSchema>;
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

type LoginStep = "login" | "leagues" | "success";

export function EspnLoginModal({ open, onOpenChange, onSuccess }: EspnLoginModalProps) {
  const [currentStep, setCurrentStep] = useState<LoginStep>("login");
  const [availableLeagues, setAvailableLeagues] = useState<League[]>([]);
  const { toast } = useToast();

  const loginForm = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const leagueForm = useForm<LeagueSelectionData>({
    resolver: zodResolver(leagueSelectionSchema),
    defaultValues: { leagueId: "" },
  });

  // Direct login mutation
  const loginMutation = useMutation({
    mutationFn: async (data: LoginFormData) => {
      const response = await apiRequest("POST", "/api/auth/espn/login", data);
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        if (data.leagues && data.leagues.length > 0) {
          setAvailableLeagues(data.leagues);
          
          // If only one league, auto-select it
          if (data.leagues.length === 1) {
            selectLeagueMutation.mutate({ leagueId: data.leagues[0].id });
          } else {
            // Multiple leagues - show selection
            setCurrentStep("leagues");
          }
        } else {
          // No leagues found
          setCurrentStep("success");
          toast({
            title: "Success",
            description: "Successfully signed in to ESPN Fantasy!",
          });
        }
        queryClient.invalidateQueries({ queryKey: ["/api/espn-credentials"] });
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

  // League selection mutation
  const selectLeagueMutation = useMutation({
    mutationFn: async (data: LeagueSelectionData) => {
      const selectedLeague = availableLeagues.find(league => league.id === data.leagueId);
      if (!selectedLeague) {
        throw new Error("Selected league not found");
      }
      
      const response = await apiRequest("POST", "/api/leagues/load", {
        userId: "default-user",
        espnLeagueId: selectedLeague.id,
        leagueName: selectedLeague.name,
        sport: selectedLeague.sport,
        season: selectedLeague.season
      });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        setCurrentStep("success");
        toast({
          title: "League Loaded",
          description: `Successfully loaded ${data.league?.name || 'your league'}!`,
        });
        queryClient.invalidateQueries({ queryKey: ["/api/leagues"] });
        setTimeout(() => {
          onOpenChange(false);
          onSuccess?.();
          resetForms();
        }, 2000);
      } else {
        toast({
          title: "Failed to Load League",
          description: data.message || "Could not load the selected league",
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
    leagueForm.reset();
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

  const renderLeagueStep = () => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Select Your League
        </CardTitle>
        <CardDescription>
          Choose which fantasy league you'd like to load into the app
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...leagueForm}>
          <form onSubmit={leagueForm.handleSubmit((data) => selectLeagueMutation.mutate(data))} className="space-y-4">
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
                onClick={() => setCurrentStep("login")}
                className="flex-1"
                data-testid="button-back-to-login"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button
                type="submit"
                className="flex-1"
                disabled={selectLeagueMutation.isPending}
                data-testid="button-load-league"
              >
                {selectLeagueMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading...
                  </>
                ) : (
                  "Load League"
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
          League Loaded!
        </CardTitle>
        <CardDescription>
          Your ESPN Fantasy league has been loaded successfully.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-center py-6">
          <div className="text-green-600 text-4xl mb-4">✓</div>
          <p className="text-sm text-muted-foreground mb-4">
            League data is now available in the app.
          </p>
          <div className="text-xs text-muted-foreground">
            You can now view teams, rosters, and matchups
          </div>
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
          {currentStep === "leagues" && renderLeagueStep()}
          {currentStep === "success" && renderSuccessStep()}
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground p-4 bg-muted rounded-lg">
          <Info className="h-4 w-4" />
          <span>
            Using headless browser automation to capture real ESPN authentication cookies.
            Your credentials are only used to log into ESPN's servers securely.
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}