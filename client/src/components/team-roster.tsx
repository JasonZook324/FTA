import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface TeamRosterProps {
  data: any;
  isLoading: boolean;
  leagueId: string;
}

export default function TeamRoster({ data, isLoading, leagueId }: TeamRosterProps) {
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

  const getTeamInitials = (location: string, nickname: string) => {
    const words = [location, nickname].filter(Boolean);
    return words.map(word => word.charAt(0).toUpperCase()).join('').slice(0, 2);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6" data-testid="rosters-grid">
      {data.teams.map((team: any) => {
        const roster = team.roster?.entries || [];
        const initials = getTeamInitials(team.location, team.nickname);
        
        return (
          <Card key={team.id} data-testid={`card-team-${team.id}`}>
            <CardHeader>
              <div className="flex items-center space-x-3">
                <div 
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                  style={{ backgroundColor: `hsl(${(team.id * 137.5) % 360}, 70%, 50%)` }}
                >
                  {initials}
                </div>
                <div>
                  <CardTitle className="text-lg">
                    {team.location} {team.nickname}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {team.owners?.[0]?.displayName || team.owners?.[0]?.firstName + ' ' + team.owners?.[0]?.lastName || 'Unknown Owner'}
                  </p>
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
                                  {player.proTeamId ? `Team ${player.proTeamId}` : "Free Agent"}
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
                                  {player.proTeamId ? `Team ${player.proTeamId}` : "Free Agent"}
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
    </div>
  );
}
