import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertEspnCredentialsSchema, type EspnCredentials } from "@shared/schema";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { RefreshCw, Save, CheckCircle, TriangleAlert, Info, Shield, LogIn, LogOut } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EspnLoginModal } from "@/components/espn-login-modal";

const credentialsFormSchema = insertEspnCredentialsSchema.extend({
  userId: z.string().min(1, "User ID is required"),
});

type CredentialsFormData = z.infer<typeof credentialsFormSchema>;

export default function Authentication() {
  const { toast } = useToast();
  const [userId] = useState("default-user"); // In a real app, this would come from auth context
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showManualEntry, setShowManualEntry] = useState(false);

  const form = useForm<CredentialsFormData>({
    resolver: zodResolver(credentialsFormSchema),
    defaultValues: {
      userId: userId,
      espnS2: "",
      swid: "",
    },
  });

  // Query existing credentials
  const { data: credentials, isLoading } = useQuery<EspnCredentials>({
    queryKey: ["/api/espn-credentials", userId],
  });

  // Save credentials mutation
  const saveCredentialsMutation = useMutation({
    mutationFn: async (data: CredentialsFormData) => {
      const response = await apiRequest("POST", "/api/espn-credentials", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "ESPN credentials saved successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/espn-credentials"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Validate credentials mutation
  const validateCredentialsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/espn-credentials/${userId}/validate`);
      return response.json();
    },
    onSuccess: (data) => {
      if (data.isValid) {
        toast({
          title: "Success",
          description: "ESPN credentials are valid",
        });
      } else {
        toast({
          title: "Invalid Credentials",
          description: "ESPN credentials failed validation. Please check your cookies.",
          variant: "destructive",
        });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/espn-credentials"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Validation Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Disconnect ESPN account mutation
  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("DELETE", `/api/espn-credentials/${userId}`);
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: "Disconnected",
          description: "ESPN account disconnected and all data cleared",
        });
        setShowManualEntry(false);
        // Clear ALL cached data to ensure complete reset
        queryClient.clear();
        
        // Force refresh of critical queries
        queryClient.invalidateQueries({ queryKey: ["/api/espn-credentials"] });
        queryClient.invalidateQueries({ queryKey: ["/api/leagues"] });
        queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      } else {
        toast({
          title: "Error",
          description: data.message || "Failed to disconnect account",
          variant: "destructive",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Disconnect Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: CredentialsFormData) => {
    saveCredentialsMutation.mutate(data);
  };

  return (
    <>
      {/* Header Bar */}
      <header className="bg-card border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Authentication & Setup</h2>
            <p className="text-muted-foreground">Configure ESPN cookies for private league access</p>
          </div>
          <div className="flex items-center space-x-3">
            <Button
              variant="secondary"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/espn-credentials"] })}
              data-testid="button-refresh"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh Data
            </Button>
            <Button
              onClick={() => setShowLoginModal(true)}
              className="bg-primary hover:bg-primary/90"
              data-testid="button-automated-login"
            >
              <Shield className="w-4 h-4 mr-2" />
              Sign in with ESPN
            </Button>
            <Button
              onClick={() => validateCredentialsMutation.mutate()}
              disabled={validateCredentialsMutation.isPending || !credentials}
              data-testid="button-test-connection"
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              Test Connection
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-auto p-6">
        {!credentials ? (
          // New user - show automated login option
          <div className="max-w-2xl mx-auto">
            <Card data-testid="card-automated-login">
              <CardHeader className="text-center">
                <CardTitle className="text-2xl flex items-center justify-center gap-3">
                  <Shield className="h-8 w-8 text-primary" />
                  Connect Your ESPN Account
                </CardTitle>
                <CardDescription className="text-base">
                  Securely sign in to your ESPN Fantasy account to automatically connect your leagues
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="text-center">
                  <Button
                    onClick={() => setShowLoginModal(true)}
                    size="lg"
                    className="px-8 py-3 text-lg"
                    data-testid="button-main-espn-login"
                  >
                    <LogIn className="w-5 h-5 mr-3" />
                    Sign in with ESPN
                  </Button>
                </div>
                
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">Or</span>
                  </div>
                </div>
                
                <div className="text-center">
                  <Button
                    variant="outline"
                    onClick={() => setShowManualEntry(true)}
                    data-testid="button-manual-entry"
                  >
                    Enter cookies manually
                  </Button>
                </div>

                <div className="bg-muted rounded-lg p-4">
                  <div className="flex items-center space-x-2 mb-2">
                    <Info className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium text-foreground">Automated Sign-In Benefits</span>
                  </div>
                  <ul className="text-xs text-muted-foreground space-y-1 ml-6">
                    <li>• No need to manually find cookies</li>
                    <li>• Automatic league discovery</li>
                    <li>• Secure credential handling</li>
                    <li>• Works with Disney SSO</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          // Existing user - show manual form and current status
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Manual Cookie Configuration - only show if requested or user has existing credentials */}
          {(showManualEntry || credentials) && (
          <Card data-testid="card-cookie-configuration">
            <CardHeader>
              <CardTitle>ESPN Authentication Cookies</CardTitle>
              <CardDescription>
                Enter your ESPN cookies to access private leagues. These are required for authenticating with ESPN's Fantasy API v3.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {credentials && (
                <div className="mb-4 p-3 bg-muted rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Status:</span>
                    <Badge variant={credentials.isValid ? "default" : "destructive"}>
                      {credentials.isValid ? "Valid" : "Invalid"}
                    </Badge>
                  </div>
                  {credentials.lastValidated && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Last validated: {new Date(credentials.lastValidated).toLocaleString()}
                    </p>
                  )}
                </div>
              )}

              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="espnS2"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>ESPN_S2 Cookie</FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            placeholder="Enter your ESPN_S2 cookie value"
                            {...field}
                            data-testid="input-espn-s2"
                          />
                        </FormControl>
                        <FormDescription>
                          Session authentication cookie from ESPN
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="swid"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>SWID Cookie</FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            placeholder="Enter your SWID cookie value"
                            {...field}
                            data-testid="input-swid"
                          />
                        </FormControl>
                        <FormDescription>
                          User identifier cookie from ESPN
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex space-x-3">
                    <Button
                      type="submit"
                      className="flex-1"
                      disabled={saveCredentialsMutation.isPending}
                      data-testid="button-save-cookies"
                    >
                      <Save className="w-4 h-4 mr-2" />
                      {saveCredentialsMutation.isPending ? "Saving..." : "Save Cookies"}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => validateCredentialsMutation.mutate()}
                      disabled={validateCredentialsMutation.isPending || !credentials}
                      data-testid="button-validate"
                    >
                      <CheckCircle className="w-4 h-4 mr-2" />
                      {validateCredentialsMutation.isPending ? "Validating..." : "Validate"}
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
          )}

          {/* Status and current credentials info */}
          {credentials && (
          <Card data-testid="card-credential-status">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Connected Account
              </CardTitle>
              <CardDescription>
                Your ESPN Fantasy account is connected and ready to use
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <span className="text-sm font-medium">Connection Status:</span>
                  <Badge variant={credentials.isValid ? "default" : "destructive"}>
                    {credentials.isValid ? "Active" : "Invalid"}
                  </Badge>
                </div>
                
                {credentials.lastValidated && (
                  <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <span className="text-sm font-medium">Last Validated:</span>
                    <span className="text-sm text-muted-foreground">
                      {new Date(credentials.lastValidated).toLocaleString()}
                    </span>
                  </div>
                )}

                <div className="flex gap-3">
                  <Button
                    onClick={() => setShowLoginModal(true)}
                    variant="outline"
                    className="flex-1"
                    data-testid="button-reconnect"
                  >
                    <Shield className="w-4 h-4 mr-2" />
                    Reconnect Account
                  </Button>
                  {!showManualEntry && (
                    <Button
                      onClick={() => setShowManualEntry(true)}
                      variant="outline"
                      className="flex-1"
                      data-testid="button-show-manual"
                    >
                      Manual Setup
                    </Button>
                  )}
                </div>
                
                <div className="pt-4 border-t">
                  <Button
                    onClick={() => disconnectMutation.mutate()}
                    disabled={disconnectMutation.isPending}
                    variant="destructive"
                    className="w-full"
                    data-testid="button-disconnect"
                  >
                    <LogOut className="w-4 h-4 mr-2" />
                    {disconnectMutation.isPending ? "Disconnecting..." : "Disconnect ESPN Account"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
          )}

          {/* Cookie Instructions */}
          <Card data-testid="card-instructions">
            <CardHeader>
              <CardTitle>How to Get ESPN Cookies</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-start space-x-3">
                  <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-sm font-medium mt-0.5">1</div>
                  <div>
                    <p className="text-sm text-foreground font-medium">Open ESPN Fantasy</p>
                    <p className="text-xs text-muted-foreground">Navigate to fantasy.espn.com and log in</p>
                  </div>
                </div>
                
                <div className="flex items-start space-x-3">
                  <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-sm font-medium mt-0.5">2</div>
                  <div>
                    <p className="text-sm text-foreground font-medium">Open Developer Tools</p>
                    <p className="text-xs text-muted-foreground">Press F12 or right-click → Inspect</p>
                  </div>
                </div>
                
                <div className="flex items-start space-x-3">
                  <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-sm font-medium mt-0.5">3</div>
                  <div>
                    <p className="text-sm text-foreground font-medium">Go to Application Tab</p>
                    <p className="text-xs text-muted-foreground">Find Cookies → https://fantasy.espn.com</p>
                  </div>
                </div>
                
                <div className="flex items-start space-x-3">
                  <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-sm font-medium mt-0.5">4</div>
                  <div>
                    <p className="text-sm text-foreground font-medium">Copy Cookie Values</p>
                    <p className="text-xs text-muted-foreground">Find espn_s2 and SWID, copy their values</p>
                  </div>
                </div>
              </div>

              <div className="mt-6 p-4 bg-muted rounded-lg">
                <div className="flex items-center space-x-2 mb-2">
                  <TriangleAlert className="w-4 h-4 text-chart-4" />
                  <span className="text-sm font-medium text-foreground">Security Notice</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  These cookies provide access to your ESPN account. Keep them secure and never share them with others.
                </p>
              </div>
            </CardContent>
          </Card>
          </div>
        )}
      </main>

      {/* ESPN Login Modal */}
      <EspnLoginModal
        open={showLoginModal}
        onOpenChange={setShowLoginModal}
        onSuccess={() => {
          toast({
            title: "Success",
            description: "ESPN account connected successfully!",
          });
        }}
      />
    </>
  );
}
