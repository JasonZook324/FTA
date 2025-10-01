import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface StandingsTableProps {
  data: any;
  isLoading: boolean;
  leagueId: string;
}

export default function StandingsTable({ data, isLoading, leagueId }: StandingsTableProps) {
  if (isLoading) {
    return (
      <Card data-testid="standings-loading">
        <CardHeader>
          <CardTitle>League Standings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="animate-pulse flex space-x-4">
                <div className="h-4 bg-muted rounded w-8"></div>
                <div className="h-4 bg-muted rounded w-32"></div>
                <div className="h-4 bg-muted rounded w-16"></div>
                <div className="h-4 bg-muted rounded w-20"></div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data?.teams) {
    return (
      <Card data-testid="standings-empty">
        <CardHeader>
          <CardTitle>League Standings</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">
            No standings data available. Check your league configuration and try refreshing.
          </p>
        </CardContent>
      </Card>
    );
  }

  const teams = data.teams.sort((a: any, b: any) => {
    const aWinPct = a.record?.overall ? a.record.overall.wins / (a.record.overall.wins + a.record.overall.losses + a.record.overall.ties) : 0;
    const bWinPct = b.record?.overall ? b.record.overall.wins / (b.record.overall.wins + b.record.overall.losses + b.record.overall.ties) : 0;
    return bWinPct - aWinPct;
  });

  const getStreakBadge = (streak: any) => {
    if (!streak) return null;
    
    const isWin = streak.type === 1; // 1 = win, 0 = loss
    const variant = isWin ? "default" : "destructive";
    const letter = isWin ? "W" : "L";
    
    return (
      <Badge variant={variant} className="text-xs">
        {letter}{streak.length}
      </Badge>
    );
  };

  const getTeamInitials = (location: string, nickname: string) => {
    const words = [location, nickname].filter(Boolean);
    return words.map(word => word.charAt(0).toUpperCase()).join('').slice(0, 2);
  };

  return (
    <Card data-testid="standings-table">
      <CardHeader>
        <CardTitle>League Standings</CardTitle>
      </CardHeader>
      
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Rank</TableHead>
                <TableHead>Team</TableHead>
                <TableHead>Record</TableHead>
                <TableHead>Points For</TableHead>
                <TableHead>Points Against</TableHead>
                <TableHead>Streak</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {teams.map((team: any, index: number) => {
                const record = team.record?.overall;
                const initials = getTeamInitials(team.location, team.nickname);
                
                return (
                  <TableRow
                    key={team.id}
                    className="hover:bg-muted/50 cursor-pointer"
                    data-testid={`row-team-${team.id}`}
                  >
                    <TableCell className="font-medium">{index + 1}</TableCell>
                    <TableCell>
                      <div className="flex items-center">
                        <div 
                          className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold mr-3"
                          style={{ backgroundColor: `hsl(${(team.id * 137.5) % 360}, 70%, 50%)` }}
                        >
                          {initials}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-foreground">
                            {team.location} {team.nickname}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {team.owners?.[0]?.displayName || team.owners?.[0]?.firstName + ' ' + team.owners?.[0]?.lastName || 'Unknown Owner'}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {record ? `${record.wins}-${record.losses}-${record.ties}` : "0-0-0"}
                    </TableCell>
                    <TableCell>
                      {record?.pointsFor?.toFixed(1) || "0.0"}
                    </TableCell>
                    <TableCell>
                      {record?.pointsAgainst?.toFixed(1) || "0.0"}
                    </TableCell>
                    <TableCell>
                      {getStreakBadge(record?.streak)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
