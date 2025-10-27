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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTeam } from "@/contexts/TeamContext";
import { useAuth } from "@/hooks/use-auth";

const credentialsFormSchema = insertEspnCredentialsSchema.omit({ userId: true });

type CredentialsFormData = z.infer<typeof credentialsFormSchema>;

// Schema for connecting to a new shareable league
const connectLeagueSchema = z.object({
  espnLeagueId: z.string().min(1, "League ID is required"),
  season: z.coerce.number().min(2020).max(2030),
  espnS2: z.string().min(1, "ESPN_S2 cookie is required"),
  swid: z.string().min(1, "SWID cookie is required"),
  leagueName: z.string().min(1, "League name is required"),
  sport: z.string().default("ffl")
});

type ConnectLeagueFormData = z.infer<typeof connectLeagueSchema>;

type LeagueProfileWithStatus = {
  id: string;
  espnLeagueId: string;
  season: number;
  name: string;
  sport: string;
  teamCount: number | null;
  currentWeek: number | null;
  createdAt: Date;
  lastUpdated: Date | null;
  isMember: boolean;
};

export default function Authentication() {
  const { toast } = useToast();
  const { user, logoutMutation } = useAuth();
  const userId = user?.id;
  const [showCredentialsForm, setShowCredentialsForm] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const { selectedTeam, setSelectedTeam } = useTeam();
  const [selectedLeagueId, setSelectedLeagueId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<string>("join");

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

  // Query available league profiles
  const { data: availableLeagues, isLoading: isLoadingAvailableLeagues } = useQuery<LeagueProfileWithStatus[]>({
    queryKey: ["/api/leagues/available"],
    enabled: !!userId,
  });

  // Connect league form
  const connectLeagueForm = useForm<ConnectLeagueFormData>({
    resolver: zodResolver(connectLeagueSchema),
    defaultValues: {
      espnLeagueId: "",
      season: 2024,
      espnS2: "",
      swid: "",
      leagueName: "",
      sport: "ffl"
    },
  });

  // Join league mutation
  const joinLeagueMutation = useMutation({
    mutationFn: async (leagueProfileId: string) => {
      const response = await apiRequest("POST", `/api/leagues/${leagueProfileId}/join`);
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Success",
        description: `You've joined ${data.leagueProfile.name}!`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues/available"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Connect new league mutation
  const connectLeagueMutation = useMutation({
    mutationFn: async (data: ConnectLeagueFormData) => {
      const response = await apiRequest("POST", "/api/leagues/connect", data);
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Success",
        description: data.isNewProfile 
          ? `League profile created for ${data.leagueProfile.name}!`
          : `You've been added to ${data.leagueProfile.name}!`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues/available"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues"] });
      connectLeagueForm.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
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

          {/* Shareable League Access */}
          <Card data-testid="card-shareable-leagues" className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                League Access
              </CardTitle>
              <CardDescription>
                Join existing leagues shared by other users, or connect a new league with your own credentials
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="join" data-testid="tab-join-league">
                    Join Existing League
                  </TabsTrigger>
                  <TabsTrigger value="connect" data-testid="tab-connect-league">
                    Connect New League
                  </TabsTrigger>
                </TabsList>

                {/* Join Existing League Tab */}
                <TabsContent value="join" className="space-y-4">
                  {isLoadingAvailableLeagues ? (
                    <div className="text-center py-8">
                      <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">Loading available leagues...</p>
                    </div>
                  ) : availableLeagues && availableLeagues.length > 0 ? (
                    <div className="space-y-3">
                      {availableLeagues.map((league) => (
                        <div
                          key={league.id}
                          className="p-4 border rounded-lg hover:border-primary/50 transition-colors"
                          data-testid={`league-card-${league.id}`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <h3 className="font-medium">{league.name}</h3>
                                {league.isMember && (
                                  <Badge variant="secondary" className="text-xs">
                                    <CheckCircle className="h-3 w-3 mr-1" />
                                    Member
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                <span>League ID: {league.espnLeagueId}</span>
                                <span>•</span>
                                <span>Season {league.season}</span>
                                {league.teamCount && (
                                  <>
                                    <span>•</span>
                                    <span>{league.teamCount} teams</span>
                                  </>
                                )}
                              </div>
                            </div>
                            <Button
                              size="sm"
                              onClick={() => joinLeagueMutation.mutate(league.id)}
                              disabled={league.isMember || joinLeagueMutation.isPending}
                              data-testid={`button-join-${league.id}`}
                            >
                              {league.isMember ? "Joined" : "Join"}
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <Trophy className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
                      <p className="text-sm text-muted-foreground mb-1">No leagues available</p>
                      <p className="text-xs text-muted-foreground">
                        Be the first to connect a league!
                      </p>
                    </div>
                  )}
                </TabsContent>

                {/* Connect New League Tab */}
                <TabsContent value="connect" className="space-y-4">
                  <div className="p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
                    <p className="text-sm text-blue-800 dark:text-blue-200">
                      Connect a new league to make it available to all users. You'll need your ESPN cookies and league information.
                    </p>
                  </div>
                  <Form {...connectLeagueForm}>
                    <form
                      onSubmit={connectLeagueForm.handleSubmit((data) => connectLeagueMutation.mutate(data))}
                      className="space-y-4"
                    >
                      <FormField
                        control={connectLeagueForm.control}
                        name="leagueName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>League Name</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="e.g., Fantasy Football 2024" data-testid="input-league-name" />
                            </FormControl>
                            <FormDescription>A friendly name for this league</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={connectLeagueForm.control}
                        name="espnLeagueId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>ESPN League ID</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="e.g., 12345678" data-testid="input-connect-league-id" />
                            </FormControl>
                            <FormDescription>Found in your ESPN league URL</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={connectLeagueForm.control}
                        name="season"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Season</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                {...field}
                                data-testid="input-connect-season"
                              />
                            </FormControl>
                            <FormDescription>The season year (e.g., 2024)</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={connectLeagueForm.control}
                        name="espnS2"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>ESPN_S2 Cookie</FormLabel>
                            <FormControl>
                              <Input {...field} type="password" placeholder="Your ESPN_S2 cookie" data-testid="input-connect-espn-s2" />
                            </FormControl>
                            <FormDescription>Session cookie from ESPN</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={connectLeagueForm.control}
                        name="swid"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>SWID Cookie</FormLabel>
                            <FormControl>
                              <Input {...field} type="password" placeholder="Your SWID cookie" data-testid="input-connect-swid" />
                            </FormControl>
                            <FormDescription>User identifier from ESPN</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button
                        type="submit"
                        className="w-full"
                        disabled={connectLeagueMutation.isPending}
                        data-testid="button-connect-league"
                      >
                        {connectLeagueMutation.isPending ? (
                          <>
                            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                            Connecting...
                          </>
                        ) : (
                          <>
                            <Plus className="w-4 h-4 mr-2" />
                            Connect League
                          </>
                        )}
                      </Button>
                    </form>
                  </Form>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

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
