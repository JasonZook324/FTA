import { useState, useEffect } from "react";
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
import { RefreshCw, Save, CheckCircle, TriangleAlert, Info, LogOut } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const credentialsFormSchema = insertEspnCredentialsSchema.extend({
  userId: z.string().min(1, "User ID is required"),
});

type CredentialsFormData = z.infer<typeof credentialsFormSchema>;

export default function Authentication() {
  const { toast } = useToast();
  const [userId] = useState("default-user"); // In a real app, this would come from auth context

  const form = useForm<CredentialsFormData>({
    resolver: zodResolver(credentialsFormSchema),
    defaultValues: {
      userId: userId,
      espnS2: "",
      swid: "",
      testLeagueId: "",
      testSeason: 2024,
    },
  });

  // Query existing credentials
  const { data: credentials, isLoading } = useQuery<EspnCredentials>({
    queryKey: ["/api/espn-credentials", userId],
  });

  // Update form when credentials are loaded
  useEffect(() => {
    if (credentials) {
      form.reset({
        userId: userId,
        espnS2: credentials.espnS2 || "",
        swid: credentials.swid || "",
        testLeagueId: credentials.testLeagueId || "",
        testSeason: credentials.testSeason || 2024,
      });
    }
  }, [credentials, userId, form]);

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
        let description = "ESPN credentials are valid";
        
        if (data.autoLoaded && data.league) {
          description = `ESPN credentials are valid and league "${data.league.name}" has been automatically loaded with ${data.league.teamCount} teams`;
        } else if (data.autoLoaded === false && data.autoLoadError) {
          description = `ESPN credentials are valid but league auto-load failed: ${data.autoLoadError}`;
        }
        
        toast({
          title: "Success",
          description: description,
        });
      } else {
        toast({
          title: "Invalid Credentials",
          description: "ESPN credentials failed validation. Please check your cookies.",
          variant: "destructive",
        });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/espn-credentials"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Validation Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Disconnect/logout mutation
  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("DELETE", `/api/espn-credentials/${userId}`);
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Disconnected",
        description: "Successfully disconnected from ESPN account and cleared all data",
      });
      // Clear all cached data
      queryClient.clear();
      // Reset the form
      form.reset({
        userId: userId,
        espnS2: "",
        swid: "",
        testLeagueId: "",
        testSeason: 2024,
      });
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
              onClick={() => validateCredentialsMutation.mutate()}
              disabled={validateCredentialsMutation.isPending || !credentials}
              data-testid="button-test-connection"
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              Test Connection
            </Button>
            {credentials && (
              <Button
                variant="destructive"
                onClick={() => disconnectMutation.mutate()}
                disabled={disconnectMutation.isPending}
                data-testid="button-disconnect"
              >
                <LogOut className="w-4 h-4 mr-2" />
                {disconnectMutation.isPending ? "Disconnecting..." : "Disconnect"}
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Cookie Configuration */}
          <Card data-testid="card-cookie-configuration">
            <CardHeader>
              <CardTitle>ESPN Authentication Cookies</CardTitle>
              <CardDescription>
                Enter your ESPN cookies to access private leagues. These are required for authenticating with ESPN's Fantasy API v3.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {credentials && (
                <div className="mb-4 space-y-3">
                  <div className="p-3 bg-muted rounded-lg">
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
                  
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <h4 className="text-sm font-medium mb-2">Currently Stored Values:</h4>
                    <div className="space-y-2 text-sm">
                      <div>
                        <span className="font-medium">ESPN S2 Cookie:</span>
                        <div className="mt-1 p-2 bg-background rounded border font-mono text-xs break-all">
                          {credentials.espnS2 ? `${credentials.espnS2.substring(0, 50)}...` : "Not set"}
                        </div>
                      </div>
                      <div>
                        <span className="font-medium">SWID:</span>
                        <div className="mt-1 p-2 bg-background rounded border font-mono text-xs">
                          {credentials.swid || "Not set"}
                        </div>
                      </div>
                      <div>
                        <span className="font-medium">Test League ID:</span>
                        <div className="mt-1 p-2 bg-background rounded border font-mono text-xs">
                          {credentials.testLeagueId || "Not set"}
                        </div>
                      </div>
                      <div>
                        <span className="font-medium">Test Season:</span>
                        <div className="mt-1 p-2 bg-background rounded border font-mono text-xs">
                          {credentials.testSeason || "Not set"}
                        </div>
                      </div>
                    </div>
                  </div>
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
                            type="text"
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
                            type="text"
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

                  <FormField
                    control={form.control}
                    name="testLeagueId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Test League ID</FormLabel>
                        <FormControl>
                          <Input
                            type="text"
                            placeholder="Enter a league ID you have access to"
                            {...field}
                            value={field.value || ""}
                            data-testid="input-test-league-id"
                          />
                        </FormControl>
                        <FormDescription>
                          A fantasy league ID you're a member of (used to validate credentials)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="testSeason"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Test Season</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            placeholder="2024"
                            value={field.value?.toString() || "2024"}
                            onChange={(e) => field.onChange(parseInt(e.target.value) || 2024)}
                            data-testid="input-test-season"
                          />
                        </FormControl>
                        <FormDescription>
                          The season year for the test league (e.g., 2024, 2025)
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
      </main>
    </>
  );
}
