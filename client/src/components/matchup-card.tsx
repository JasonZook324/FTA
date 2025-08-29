import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface MatchupCardProps {
  data: any;
  isLoading: boolean;
  leagueId: string;
  week?: string;
}

export default function MatchupCard({ data, isLoading, leagueId, week }: MatchupCardProps) {
  if (isLoading) {
    return (
      <Card data-testid="matchups-loading">
        <CardHeader>
          <CardTitle>Weekly Matchups</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="animate-pulse border border-border rounded-lg p-4">
                <div className="h-4 bg-muted rounded w-1/2 mb-3"></div>
                <div className="space-y-3">
                  <div className="h-8 bg-muted rounded"></div>
                  <div className="h-8 bg-muted rounded"></div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // ESPN API returns matchup data in the schedule array, with team info in teams array
  if (!data?.schedule || data.schedule.length === 0 || !data?.teams || data.teams.length === 0) {
    return (
      <Card data-testid="matchups-empty">
        <CardHeader>
          <CardTitle>Weekly Matchups</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">
            No matchup data available. Check your league configuration and try refreshing.
          </p>
        </CardContent>
      </Card>
    );
  }

  const getTeamInitials = (location: string, nickname: string) => {
    const words = [location, nickname].filter(Boolean);
    return words.map(word => word.charAt(0).toUpperCase()).join('').slice(0, 2);
  };

  const getMatchupStatus = (matchup: any) => {
    if (matchup.winner === "UNDECIDED") {
      return { status: "In Progress", color: "bg-chart-3 text-black" };
    } else if (matchup.winner === "TIE") {
      return { status: "Tied", color: "bg-chart-3 text-black" };
    } else {
      const winnerTeam = matchup.home.teamId === matchup.winner ? matchup.home : matchup.away;
      return { 
        status: `${getTeamInitials(winnerTeam.location, winnerTeam.nickname)} Wins`, 
        color: "bg-chart-2 text-white" 
      };
    }
  };

  return (
    <Card data-testid="matchups-table">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Weekly Matchups</CardTitle>
          <div className="flex items-center space-x-2">
            <span className="text-sm text-muted-foreground">
              {week ? `Week ${week}` : "Current Week"}
            </span>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* ESPN API stores matchup data in the schedule array */}
          {(data.schedule || []).map((matchup: any, index: number) => {
            const homeTeam = data.teams?.find((t: any) => t.id === matchup.home?.teamId);
            const awayTeam = data.teams?.find((t: any) => t.id === matchup.away?.teamId);
            
            // Skip if we can't find the teams or matchup doesn't have proper structure
            if (!homeTeam || !awayTeam || !matchup.home || !matchup.away) return null;
            
            const status = getMatchupStatus(matchup);
            
            return (
              <div
                key={matchup.id || index}
                className="border border-border rounded-lg p-4 hover:shadow-md transition-shadow"
                data-testid={`matchup-${index}`}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-muted-foreground">Matchup {index + 1}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date().toLocaleDateString()}
                  </span>
                </div>
                
                <div className="space-y-3">
                  {/* Home Team */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div 
                        className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold"
                        style={{ backgroundColor: `hsl(${(homeTeam.id * 137.5) % 360}, 70%, 50%)` }}
                      >
                        {getTeamInitials(homeTeam.location, homeTeam.nickname)}
                      </div>
                      <span className="text-sm font-medium text-foreground">
                        {homeTeam.location} {homeTeam.nickname}
                      </span>
                    </div>
                    <span className="text-lg font-bold text-foreground">
                      {matchup.home.totalPoints?.toFixed(1) || "0.0"}
                    </span>
                  </div>
                  
                  <div className="flex items-center justify-center">
                    <span className="text-xs text-muted-foreground">VS</span>
                  </div>
                  
                  {/* Away Team */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div 
                        className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold"
                        style={{ backgroundColor: `hsl(${(awayTeam.id * 137.5) % 360}, 70%, 50%)` }}
                      >
                        {getTeamInitials(awayTeam.location, awayTeam.nickname)}
                      </div>
                      <span className="text-sm font-medium text-foreground">
                        {awayTeam.location} {awayTeam.nickname}
                      </span>
                    </div>
                    <span className="text-lg font-bold text-foreground">
                      {matchup.away.totalPoints?.toFixed(1) || "0.0"}
                    </span>
                  </div>
                </div>
                
                <div className="mt-3 pt-3 border-t border-border flex justify-between text-xs">
                  <span className="text-muted-foreground">
                    {matchup.winner === "UNDECIDED" ? "In Progress" : "Final"}
                  </span>
                  <Badge className={status.color}>
                    {status.status}
                  </Badge>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
