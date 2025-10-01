import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Download, Sparkles, Loader2, Copy, Check } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useTeam } from "@/contexts/TeamContext";
import { useToast } from "@/hooks/use-toast";

interface TeamRosterProps {
  data: any;
  isLoading: boolean;
  leagueId: string;
}

export default function TeamRoster({ data, isLoading, leagueId }: TeamRosterProps) {
  const { toast } = useToast();
  const { selectedTeam } = useTeam();
  const [optimizingTeamId, setOptimizingTeamId] = useState<number | null>(null);
  const [optimizationResult, setOptimizationResult] = useState<any>(null);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleOptimizeLineup = async (teamId: number) => {
    try {
      setIsOptimizing(true);
      const response = await apiRequest("POST", `/api/leagues/${leagueId}/teams/${teamId}/optimize-lineup-prompt`);
      const result = await response.json();
      setOptimizationResult(result);
      setOptimizingTeamId(teamId);
    } catch (error: any) {
      console.error('Failed to generate lineup prompt:', error);
      toast({
        title: "Failed to generate prompt",
        description: error.message || 'Unknown error',
        variant: "destructive",
      });
    } finally {
      setIsOptimizing(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({
        title: "Copied to clipboard",
        description: "Prompt copied successfully. Paste it into your AI portal.",
      });
    } catch (error) {
      toast({
        title: "Failed to copy",
        description: "Please try again or manually select and copy the text.",
        variant: "destructive",
      });
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
                <div className="flex flex-col items-end gap-2">
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
            <DialogTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" />
                AI Lineup Optimization Prompt
              </span>
              {optimizationResult?.prompt && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => copyToClipboard(optimizationResult.prompt)}
                  data-testid="button-copy-lineup-prompt"
                >
                  {copied ? (
                    <><Check className="h-4 w-4 mr-2" /> Copied</>
                  ) : (
                    <><Copy className="h-4 w-4 mr-2" /> Copy Prompt</>
                  )}
                </Button>
              )}
            </DialogTitle>
            <DialogDescription>
              Copy this prompt and paste it into ChatGPT, Claude, or your preferred AI assistant to get lineup optimization recommendations
            </DialogDescription>
          </DialogHeader>

          {optimizationResult?.prompt && (
            <div className="mt-4">
              <div className="p-4 bg-muted rounded-lg border border-border max-h-96 overflow-y-auto">
                <pre className="text-sm whitespace-pre-wrap font-mono">{optimizationResult.prompt}</pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
