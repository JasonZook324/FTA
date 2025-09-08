import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertEspnCredentialsSchema, insertLeagueSchema, type EspnCredentials, type League } from "@shared/schema";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { RefreshCw, Save, CheckCircle, TriangleAlert, Info, LogOut, Plus, Users, Calendar, Trophy, Settings } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const credentialsFormSchema = insertEspnCredentialsSchema.extend({
  userId: z.string().min(1, "User ID is required"),
});

type CredentialsFormData = z.infer<typeof credentialsFormSchema>;

export default function Authentication() {
  const { toast } = useToast();
  const [userId] = useState("default-user"); // In a real app, this would come from auth context
  const [showCredentialsForm, setShowCredentialsForm] = useState(false);

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

  // Query user leagues
  const { data: leagues, isLoading: leaguesLoading } = useQuery({
    queryKey: ["/api/leagues", userId],
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
      // Hide form if credentials are valid, show if invalid or don't exist
      setShowCredentialsForm(!credentials.isValid);
    } else {
      // No credentials exist, show form
      setShowCredentialsForm(true);
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
      setShowCredentialsForm(false);
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
            <h2 className="text-2xl font-bold text-foreground">ESPN Fantasy Manager</h2>
            <p className="text-muted-foreground">Configure authentication and manage your ESPN fantasy leagues</p>
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
              {credentials && !showCredentialsForm ? (
                <div className="mb-6 space-y-4">
                  {/* Authentication Status Card */}
                  <div className="p-4 bg-gradient-to-r from-green-50 to-green-100 dark:from-green-950 dark:to-green-900 rounded-lg border border-green-200 dark:border-green-800">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                        <span className="font-semibold text-green-800 dark:text-green-200">Connected to ESPN</span>
                      </div>
                      <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100">
                        {credentials.isValid ? "Authenticated" : "Needs Validation"}
                      </Badge>
                    </div>
                    <p className="text-sm text-green-700 dark:text-green-300">
                      Your ESPN credentials are configured and working properly
                    </p>
                    {credentials.lastValidated && (
                      <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                        Last verified: {new Date(credentials.lastValidated).toLocaleString()}
                      </p>
                    )}
                  </div>

                  {/* League Connection Info */}
                  {credentials.testLeagueId && (
                    <div className="p-3 bg-muted rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-sm font-medium">Connected League:</span>
                          <p className="text-xs text-muted-foreground">League ID {credentials.testLeagueId} • Season {credentials.testSeason}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Edit Credentials Button */}
                  <Button
                    variant="outline"
                    onClick={() => setShowCredentialsForm(true)}
                    className="w-full"
                    data-testid="button-edit-credentials"
                  >
                    <Settings className="w-4 h-4 mr-2" />
                    Modify Credentials
                  </Button>
                </div>
              ) : null}

              {showCredentialsForm && (
                <>
                  {credentials && !credentials.isValid && (
                    <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                      <p className="text-sm text-destructive">
                        Your current credentials are invalid. Please update them below.
                      </p>
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
                  
                  {!credentials && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowCredentialsForm(false)}
                      className="w-full mt-4"
                      data-testid="button-cancel"
                    >
                      Cancel
                    </Button>
                  )}
                </>
              )}
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

        {/* Leagues Section - Only show if authenticated */}
        {credentials?.isValid && (
          <>
            <Separator className="my-8" />
            
            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-semibold text-foreground mb-2">Your Leagues</h3>
                <p className="text-muted-foreground">Manage and view your ESPN fantasy leagues</p>
              </div>

              {/* Leagues List */}
              <Card data-testid="card-leagues-list">
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Trophy className="w-5 h-5" />
                    <span>Loaded Leagues</span>
                  </CardTitle>
                  <CardDescription>
                    Leagues you have loaded from ESPN Fantasy
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {leaguesLoading ? (
                    <div className="space-y-3">
                      {[...Array(3)].map((_, i) => (
                        <div key={i} className="animate-pulse">
                          <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
                          <div className="h-3 bg-muted rounded w-1/2"></div>
                        </div>
                      ))}
                    </div>
                  ) : leagues && Array.isArray(leagues) && leagues.length > 0 ? (
                    <div className="space-y-4">
                      {(leagues as any[]).map((league: any) => (
                        <Card key={league.id} className="p-4">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-semibold text-foreground">{league.name}</h4>
                            <Badge variant="outline">{league.sport.toUpperCase()}</Badge>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                              <span className="text-muted-foreground">Season:</span>
                              <div className="font-medium">{league.season}</div>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Teams:</span>
                              <div className="font-medium">{league.teamCount}</div>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Week:</span>
                              <div className="font-medium">{league.currentWeek}</div>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Updated:</span>
                              <div className="font-medium">
                                {league.lastUpdated ? new Date(league.lastUpdated).toLocaleDateString() : "Never"}
                              </div>
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <Trophy className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground">No leagues loaded yet</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Successfully validate your credentials above to automatically load your league
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </main>
    </>
  );
}
