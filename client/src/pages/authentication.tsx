import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertLeagueSchema, type League } from "@shared/schema";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { RefreshCw, CheckCircle, Plus, Users, Calendar, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTeam } from "@/contexts/TeamContext";
import { useAuth } from "@/hooks/use-auth";

// Schema for connecting to a new shareable league
const connectLeagueSchema = z.object({
  espnLeagueId: z.string().min(1, "League ID is required"),
  season: z.coerce.number().min(2020).max(2030),
  espnS2: z.string().min(1, "ESPN_S2 cookie is required"),
  swid: z.string().min(1, "SWID cookie is required"),
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
  const { selectedTeam, setSelectedTeam } = useTeam();
  const [activeTab, setActiveTab] = useState<string>("join");

  // Query user leagues
  const { data: leagues } = useQuery<League[]>({
    queryKey: ["/api/leagues"],
    enabled: !!userId,
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



  return (
    <>
      {/* Header Bar */}
      <header className="bg-card border-b border-border px-6 py-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Authentication</h2>
          <p className="text-muted-foreground">Join or connect shareable ESPN fantasy leagues</p>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-auto p-6">
        <div className="space-y-6">
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
                      Connect a new league to make it available to all users. The league name and details will be automatically fetched from ESPN.
                    </p>
                  </div>
                  <Form {...connectLeagueForm}>
                    <form
                      onSubmit={connectLeagueForm.handleSubmit((data) => connectLeagueMutation.mutate(data))}
                      className="space-y-4"
                    >
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

        </div>
      </main>
    </>
  );
}
