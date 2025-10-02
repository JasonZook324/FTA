import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Download, RefreshCw, Trophy } from "lucide-react";
import LeagueSelector from "@/components/league-selector";
import { useAuth } from "@/hooks/use-auth";

export default function Leagues() {
  const { toast } = useToast();
  const { user } = useAuth();

  // Query user leagues
  const { data: leagues, isLoading: leaguesLoading } = useQuery({
    queryKey: ["/api/leagues"],
    enabled: !!user,
  });

  // Query ESPN credentials status  
  const { data: credentials } = useQuery<{ isValid?: boolean }>({
    queryKey: ["/api/espn-credentials"],
    enabled: !!user,
  });

  return (
    <>
      {/* Header Bar */}
      <header className="bg-card border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">My Leagues</h2>
            <p className="text-muted-foreground">Manage and view your ESPN fantasy leagues</p>
          </div>
          <div className="flex items-center space-x-3">
            <Button
              variant="secondary"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/leagues"] })}
              data-testid="button-refresh"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-auto p-6">
        {/* Authentication Status */}
        {!credentials?.isValid && (
          <Card className="mb-6 border-destructive/50 bg-destructive/5">
            <CardContent className="pt-4">
              <div className="flex items-center space-x-2">
                <Badge variant="destructive">Authentication Required</Badge>
                <p className="text-sm text-muted-foreground">
                  Please configure your ESPN credentials in the Authentication section before loading leagues.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* League Selector */}
          <LeagueSelector disabled={!credentials?.isValid} />

          {/* League Information */}
          <div className="xl:col-span-2">
            <Card data-testid="card-leagues-list">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Trophy className="w-5 h-5" />
                  <span>Your Leagues</span>
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
                ) : leagues && leagues.length > 0 ? (
                  <div className="space-y-4">
                    {leagues.map((league: any) => (
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
                      Use the League Selector to load your ESPN fantasy leagues
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* API Endpoints Reference */}
        <Card className="mt-8" data-testid="card-api-reference">
          <CardHeader>
            <CardTitle>API Endpoints Reference</CardTitle>
            <CardDescription>ESPN Fantasy API v3 endpoints and view parameters</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-foreground">League Data</h4>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Team Info:</span>
                    <code className="text-primary font-mono">view=mTeam</code>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Standings:</span>
                    <code className="text-primary font-mono">view=mStandings</code>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Settings:</span>
                    <code className="text-primary font-mono">view=mSettings</code>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Rosters:</span>
                    <code className="text-primary font-mono">view=mRoster</code>
                  </div>
                </div>
              </div>
              
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-foreground">Player & Match Data</h4>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Player Info:</span>
                    <code className="text-primary font-mono">view=kona_player_info</code>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Matchups:</span>
                    <code className="text-primary font-mono">view=mMatchup</code>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Box Scores:</span>
                    <code className="text-primary font-mono">view=mBoxscore</code>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Draft Results:</span>
                    <code className="text-primary font-mono">view=mDraftDetail</code>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
