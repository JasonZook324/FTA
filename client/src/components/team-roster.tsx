import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Download, Sparkles, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useTeam } from "@/contexts/TeamContext";

interface TeamRosterProps {
  data: any;
  isLoading: boolean;
  leagueId: string;
}

export default function TeamRoster({ data, isLoading, leagueId }: TeamRosterProps) {
  const { selectedTeam } = useTeam();
  const [optimizingTeamId, setOptimizingTeamId] = useState<number | null>(null);
  const [optimizationResult, setOptimizationResult] = useState<any>(null);
  const [isOptimizing, setIsOptimizing] = useState(false);

  const handleOptimizeLineup = async (teamId: number) => {
    try {
      setIsOptimizing(true);
      const response = await apiRequest("POST", `/api/leagues/${leagueId}/teams/${teamId}/optimize-lineup`);
      const result = await response.json();
      setOptimizationResult(result);
      setOptimizingTeamId(teamId);
    } catch (error: any) {
      console.error('Failed to optimize lineup:', error);
      alert(`Failed to optimize lineup: ${error.message || 'Unknown error'}`);
    } finally {
      setIsOptimizing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[...Array(6)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader>
              <div className="h-6 bg-muted rounded w-3/4"></div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[...Array(5)].map((_, j) => (
                  <div key={j} className="h-4 bg-muted rounded"></div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!data?.teams) {
    return (
      <Card data-testid="rosters-empty">
        <CardContent className="flex items-center justify-center h-96">
          <p className="text-muted-foreground">
            No roster data available. Check your league configuration and try refreshing.
          </p>
        </CardContent>
      </Card>
    );
  }

  const getPositionColor = (position: string) => {
    const colors: Record<string, string> = {
      QB: "bg-chart-1",
      RB: "bg-chart-2", 
      WR: "bg-chart-3",
      TE: "bg-chart-4",
      K: "bg-chart-5",
      DST: "bg-secondary",
      D: "bg-secondary",
      DEF: "bg-secondary"
    };
    return colors[position] || "bg-muted";
  };

  const getNFLTeamName = (teamId: number): string => {
    const teamNames: Record<number, string> = {
      1: "ATL", 2: "BUF", 3: "CHI", 4: "CIN", 5: "CLE", 6: "DAL", 7: "DEN", 8: "DET",
      9: "GB", 10: "TEN", 11: "IND", 12: "KC", 13: "LV", 14: "LAR", 15: "MIA", 16: "MIN",
      17: "NE", 18: "NO", 19: "NYG", 20: "NYJ", 21: "PHI", 22: "ARI", 23: "PIT", 24: "LAC",
      25: "SF", 26: "SEA", 27: "TB", 28: "WAS", 29: "CAR", 30: "JAX", 33: "BAL", 34: "HOU"
    };
    return teamNames[teamId] || "FA";
  };

  const getTeamInitials = (location: string, nickname: string) => {
    const words = [location, nickname].filter(Boolean);
    return words.map(word => word.charAt(0).toUpperCase()).join('').slice(0, 2);
  };

  // Helper function to get owner info from members data
  const getOwnerInfo = (team: any) => {
    if (!team.owners || !data.members) return 'Unknown Owner';
    
    // Find the primary owner (first one)
    const ownerId = team.owners[0]?.id || team.owners[0];
    const member = data.members.find((m: any) => m.id === ownerId);
    
    if (member) {
      // Prefer real name (firstName + lastName) over displayName
      if (member.firstName && member.lastName) {
        return `${member.firstName} ${member.lastName}`;
      }
      // Fall back to displayName only if no real name available
      return member.displayName || 'Unknown Owner';
    }
    return 'Unknown Owner';
  };

  // Helper function to get team name with better fallbacks
  const getTeamName = (team: any) => {
    // Try various team name combinations
    if (team.location && team.nickname) {
      return `${team.location} ${team.nickname}`;
    }
    if (team.location) return team.location;
    if (team.nickname) return team.nickname;
    if (team.name) return team.name;
    return `Team ${team.id}`;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6" data-testid="rosters-grid">
      {data.teams.map((team: any) => {
        const roster = team.roster?.entries || [];
        const teamName = getTeamName(team);
        const initials = getTeamInitials(team.location || teamName.split(' ')[0], team.nickname || teamName.split(' ')[1] || '');
        const ownerName = getOwnerInfo(team);
        
        return (
          <Card key={team.id} data-testid={`card-team-${team.id}`}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div 
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                    style={{ backgroundColor: `hsl(${(team.id * 137.5) % 360}, 70%, 50%)` }}
                  >
                    {initials}
                  </div>
                  <div>
                    <CardTitle className="text-lg">
                      {teamName}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {ownerName}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {selectedTeam?.teamId === team.id && (
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => handleOptimizeLineup(team.id)}
                      disabled={isOptimizing}
                      data-testid={`button-optimize-team-${team.id}`}
                    >
                      {isOptimizing ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Sparkles className="w-4 h-4 mr-2" />
                      )}
                      Optimize Lineup
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const url = `/api/leagues/${leagueId}/teams/${team.id}/roster-export?t=${Date.now()}`;
                      window.open(url, '_blank');
                    }}
                    data-testid={`button-export-team-${team.id}`}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Export CSV
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="active" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="active">Active</TabsTrigger>
                  <TabsTrigger value="bench">Bench</TabsTrigger>
                </TabsList>
                
                <TabsContent value="active" className="mt-4">
                  <div className="space-y-2">
                    {roster
                      .filter((entry: any) => entry.lineupSlotId !== 20 && entry.lineupSlotId !== 21) // Not bench
                      .map((entry: any, index: number) => {
                        const player = entry.playerPoolEntry?.player;
                        if (!player) return null;
                        
                        return (
                          <div
                            key={player.id || index}
                            className="flex items-center justify-between p-2 border border-border rounded-md"
                            data-testid={`player-active-${player.id}`}
                          >
                            <div className="flex items-center space-x-3">
                              <Badge 
                                className={`${getPositionColor(player.defaultPositionId === 1 ? "QB" : player.defaultPositionId === 2 ? "RB" : player.defaultPositionId === 3 ? "WR" : player.defaultPositionId === 4 ? "TE" : player.defaultPositionId === 5 ? "K" : "DEF")} text-white text-xs`}
                              >
                                {player.defaultPositionId === 1 ? "QB" : 
                                 player.defaultPositionId === 2 ? "RB" :
                                 player.defaultPositionId === 3 ? "WR" :
                                 player.defaultPositionId === 4 ? "TE" :
                                 player.defaultPositionId === 5 ? "K" : "DEF"}
                              </Badge>
                              <div>
                                <div className="text-sm font-medium text-foreground">
                                  {player.fullName}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {player.proTeamId ? getNFLTeamName(player.proTeamId) : "FA"}
                                </div>
                              </div>
                            </div>
                            {entry.playerPoolEntry?.appliedStatTotal && (
                              <div className="text-sm font-medium text-foreground">
                                {entry.playerPoolEntry.appliedStatTotal.toFixed(1)}
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                </TabsContent>
                
                <TabsContent value="bench" className="mt-4">
                  <div className="space-y-2">
                    {roster
                      .filter((entry: any) => entry.lineupSlotId === 20 || entry.lineupSlotId === 21) // Bench slots
                      .map((entry: any, index: number) => {
                        const player = entry.playerPoolEntry?.player;
                        if (!player) return null;
                        
                        return (
                          <div
                            key={player.id || index}
                            className="flex items-center justify-between p-2 border border-border rounded-md opacity-70"
                            data-testid={`player-bench-${player.id}`}
                          >
                            <div className="flex items-center space-x-3">
                              <Badge variant="outline" className="text-xs">
                                {player.defaultPositionId === 1 ? "QB" : 
                                 player.defaultPositionId === 2 ? "RB" :
                                 player.defaultPositionId === 3 ? "WR" :
                                 player.defaultPositionId === 4 ? "TE" :
                                 player.defaultPositionId === 5 ? "K" : "DEF"}
                              </Badge>
                              <div>
                                <div className="text-sm font-medium text-foreground">
                                  {player.fullName}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {player.proTeamId ? getNFLTeamName(player.proTeamId) : "FA"}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        );
      })}

      {/* Optimization Dialog */}
      <Dialog open={optimizingTeamId !== null} onOpenChange={(open) => !open && setOptimizingTeamId(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              AI Lineup Optimization
            </DialogTitle>
            <DialogDescription>
              AI-powered lineup recommendations based on current matchups, player performance, and scoring settings
            </DialogDescription>
          </DialogHeader>

          {optimizationResult && (
            <div className="space-y-6 mt-4">
              {/* Summary */}
              <div className="bg-muted/50 p-4 rounded-lg">
                <h3 className="font-semibold text-sm mb-2">Overall Assessment</h3>
                <p className="text-sm text-muted-foreground">{optimizationResult.summary}</p>
              </div>

              {/* Key Changes */}
              {optimizationResult.keyChanges && optimizationResult.keyChanges.length > 0 && (
                <div>
                  <h3 className="font-semibold text-sm mb-3">Key Changes Recommended</h3>
                  <div className="space-y-2">
                    {optimizationResult.keyChanges.map((change: string, index: number) => (
                      <div key={index} className="flex items-start gap-2 p-3 bg-primary/5 border border-primary/20 rounded-md">
                        <Badge variant="default" className="shrink-0">Change {index + 1}</Badge>
                        <p className="text-sm">{change}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recommended Lineup */}
              {optimizationResult.recommendedLineup && optimizationResult.recommendedLineup.length > 0 && (
                <div>
                  <h3 className="font-semibold text-sm mb-3">Recommended Starting Lineup</h3>
                  <div className="space-y-2">
                    {optimizationResult.recommendedLineup.map((item: any, index: number) => (
                      <div key={index} className="flex items-start gap-3 p-3 border border-border rounded-md">
                        <Badge className="shrink-0">{item.position}</Badge>
                        <div className="flex-1">
                          <p className="font-medium text-sm">{item.player}</p>
                          <p className="text-xs text-muted-foreground mt-1">{item.reason}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Bench Players */}
              {optimizationResult.benchPlayers && optimizationResult.benchPlayers.length > 0 && (
                <div>
                  <h3 className="font-semibold text-sm mb-3">Bench This Week</h3>
                  <div className="space-y-2">
                    {optimizationResult.benchPlayers.map((item: any, index: number) => (
                      <div key={index} className="flex items-start gap-3 p-3 border border-border rounded-md opacity-70">
                        <div className="flex-1">
                          <p className="font-medium text-sm">{item.player}</p>
                          <p className="text-xs text-muted-foreground mt-1">{item.reason}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Projected Impact */}
              {optimizationResult.projectedImpact && (
                <div className="bg-primary/10 p-4 rounded-lg">
                  <h3 className="font-semibold text-sm mb-2">Projected Impact</h3>
                  <p className="text-sm">{optimizationResult.projectedImpact}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
