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
import { RefreshCw, Save, CheckCircle, TriangleAlert, Info, LogOut, Plus, Users, Calendar, Trophy, Settings, UserCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTeam } from "@/contexts/TeamContext";
import { useAuth } from "@/hooks/use-auth";

const credentialsFormSchema = insertEspnCredentialsSchema.omit({ userId: true });

type CredentialsFormData = z.infer<typeof credentialsFormSchema>;

export default function Authentication() {
  const { toast } = useToast();
  const { user, logoutMutation } = useAuth();
  const userId = user?.id;
  const [showCredentialsForm, setShowCredentialsForm] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const { selectedTeam, setSelectedTeam } = useTeam();
  const [selectedLeagueId, setSelectedLeagueId] = useState<string>("");

  const form = useForm<CredentialsFormData>({
    resolver: zodResolver(credentialsFormSchema),
    defaultValues: {
      espnS2: "",
      swid: "",
      testLeagueId: "",
      testSeason: 2024,
    },
  });

  // Query existing credentials
  const { data: credentials, isLoading } = useQuery<EspnCredentials>({
    queryKey: ["/api/espn-credentials"],
    enabled: !!userId,
  });

  // Query user leagues
  const { data: leagues } = useQuery<League[]>({
    queryKey: ["/api/leagues"],
    enabled: !!userId,
  });

  // Query teams for selected league (use standings endpoint to get properly formatted team names)
  const { data: teamsData, isLoading: isLoadingTeams, isError: isTeamsError } = useQuery<{ teams?: any[] }>({
    queryKey: ["/api/leagues", selectedLeagueId, "standings"],
    enabled: !!selectedLeagueId,
  });


  // Update form when credentials are loaded
  useEffect(() => {
    if (credentials) {
      form.reset({
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
  }, [credentials, form]);

  // Auto-select the currently loaded league (first one)
  useEffect(() => {
    if (leagues && leagues.length > 0 && !selectedLeagueId) {
      setSelectedLeagueId(leagues[0].id);
    }
  }, [leagues, selectedLeagueId]);

  // Auto-select the first team when teams are loaded
  useEffect(() => {
    if (teamsData?.teams && teamsData.teams.length > 0 && selectedLeagueId && !selectedTeam) {
      const firstTeam = teamsData.teams[0];
      // Use the same logic as in the display to get the team name
      let teamName;
      if (firstTeam.location && firstTeam.nickname) {
        teamName = `${firstTeam.location} ${firstTeam.nickname}`;
      } else if (firstTeam.name) {
        teamName = firstTeam.name;
      } else if (firstTeam.owners && firstTeam.owners[0]?.displayName) {
        teamName = `${firstTeam.owners[0].displayName}'s Team`;
      } else {
        teamName = `Team ${firstTeam.id}`;
      }
      
      setSelectedTeam({
        teamId: firstTeam.id,
        teamName,
        leagueId: selectedLeagueId
      });
    }
  }, [teamsData, selectedLeagueId, selectedTeam, setSelectedTeam]);

  // Save credentials mutation
  const saveCredentialsMutation = useMutation({
    mutationFn: async (data: CredentialsFormData) => {
      const response = await apiRequest("POST", "/api/espn-credentials", data);
      return response.json();
    },
    onSuccess: async () => {
      toast({
        title: "Success", 
        description: "ESPN credentials saved successfully. Testing connection and reloading league data...",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/espn-credentials"] });
      setShowCredentialsForm(false);
      
      // Automatically trigger league reload with fixed logic
      setTimeout(() => {
        reloadLeagueMutation.mutate();
      }, 500);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Reload league data mutation
  const reloadLeagueMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/espn-credentials/reload-league`);
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Success",
        description: `League data reloaded! "${data.league.name}" now has ${data.league.teamCount} teams with proper names and owners.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/espn-credentials"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Reload Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Validate credentials mutation
  const validateCredentialsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/espn-credentials/validate`);
      return response.json();
    },
    onSuccess: (data) => {
      if (data.isValid) {
        toast({
          title: "Valid Credentials",
          description: "ESPN credentials are working! Now click 'Reload League Data' to refresh team information.",
        });
        
        // Don't auto-load here anymore, let user manually reload
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
              onClick={() => validateCredentialsMutation.mutate()}
              disabled={validateCredentialsMutation.isPending || !credentials}
              data-testid="button-test-connection"
              variant="outline"
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              Test Connection
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-auto p-6">
        <div className="space-y-6">
          {/* Team Selector Card */}
          {credentials && credentials.isValid && leagues && leagues.length > 0 && (
            <Card data-testid="card-team-selector">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserCheck className="h-5 w-5" />
                  Select Your Team
                </CardTitle>
                <CardDescription>
                  Choose which team you manage in your league. This selection will be used throughout the application.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* League Selector */}
                  <div className="space-y-2">
                    <Label htmlFor="league-select">League</Label>
                    <Select 
                      value={selectedLeagueId} 
                      onValueChange={(value) => {
                        setSelectedLeagueId(value);
                        setSelectedTeam(null);
                      }}
                    >
                      <SelectTrigger id="league-select" data-testid="select-league">
                        <SelectValue placeholder="Select a league" />
                      </SelectTrigger>
                      <SelectContent>
                        {leagues.map((league) => (
                          <SelectItem key={league.id} value={league.id}>
                            {league.name} ({league.season})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Team Selector */}
                  <div className="space-y-2">
                    <Label htmlFor="team-select">Your Team</Label>
                    <Select 
                      value={selectedTeam?.teamId.toString() || ""} 
                      onValueChange={(value) => {
                        const teamId = parseInt(value);
                        const team = teamsData?.teams?.find((t: any) => t.id === teamId);
                        if (team && selectedLeagueId) {
                          // Use the same logic as in the display to get the team name
                          let teamName;
                          if (team.location && team.nickname) {
                            teamName = `${team.location} ${team.nickname}`;
                          } else if (team.name) {
                            teamName = team.name;
                          } else if (team.owners && team.owners[0]?.displayName) {
                            teamName = `${team.owners[0].displayName}'s Team`;
                          } else {
                            teamName = `Team ${team.id}`;
                          }
                          
                          setSelectedTeam({
                            teamId,
                            teamName,
                            leagueId: selectedLeagueId
                          });
                          toast({
                            title: "Team Selected",
                            description: `You are now managing "${teamName}"`,
                          });
                        }
                      }}
                      disabled={!selectedLeagueId || isLoadingTeams || !teamsData?.teams?.length}
                    >
                      <SelectTrigger id="team-select" data-testid="select-team">
                        <SelectValue placeholder={
                          !selectedLeagueId 
                            ? "Select a league first" 
                            : isLoadingTeams 
                              ? "Loading teams..." 
                              : isTeamsError 
                                ? "Error loading teams" 
                                : !teamsData?.teams?.length 
                                  ? "No teams found" 
                                  : "Select your team"
                        } />
                      </SelectTrigger>
                      <SelectContent>
                        {teamsData?.teams?.map((team: any) => {
                          // Debug: Log the team data to see what we're working with
                          if ([9, 12, 14].includes(team.id)) {
                            console.log(`Team ${team.id} data:`, {
                              id: team.id,
                              name: team.name,
                              location: team.location,
                              nickname: team.nickname,
                              fullTeam: team
                            });
                          }
                          
                          // Try multiple sources for team name with fallbacks
                          let teamName;
                          if (team.location && team.nickname) {
                            teamName = `${team.location} ${team.nickname}`;
                          } else if (team.name) {
                            teamName = team.name;
                          } else if (team.owners && team.owners[0]?.displayName) {
                            teamName = `${team.owners[0].displayName}'s Team`;
                          } else {
                            teamName = `Team ${team.id}`;
                          }
                          return (
                            <SelectItem key={team.id} value={team.id.toString()}>
                              {teamName}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                    {isTeamsError && (
                      <p className="text-xs text-destructive">Failed to load teams. Please try selecting a different league.</p>
                    )}
                  </div>
                </div>

                {selectedTeam && (
                  <div className="mt-4 p-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                      <span className="text-sm font-medium text-green-800 dark:text-green-200">
                        Managing: {selectedTeam.teamName}
                      </span>
                    </div>
                    <p className="text-xs text-green-700 dark:text-green-300 mt-1">
                      This team will be used for AI recommendations and analysis features
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

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

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={saveCredentialsMutation.isPending}
                    data-testid="button-save-cookies"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    {saveCredentialsMutation.isPending ? "Saving..." : "Save Cookies"}
                  </Button>
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
              <CardTitle className="flex items-center justify-between">
                <span>How to Get ESPN Cookies</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowInstructions(!showInstructions)}
                  data-testid="button-toggle-instructions"
                >
                  <Info className="w-4 h-4 mr-2" />
                  {showInstructions ? "Hide Instructions" : "Show Instructions"}
                </Button>
              </CardTitle>
            </CardHeader>
            {showInstructions && (
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
            )}
          </Card>
          </div>
        </div>
      </main>
    </>
  );
}
