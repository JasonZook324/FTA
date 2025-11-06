import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { RefreshCw, FlaskConical, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/hooks/use-auth";
import { useNFLMatchups, useDefensiveRankings } from "@/hooks/use-nfl-matchups";
import { queryClient } from "@/lib/queryClient";

export default function OPRKSandbox() {
  const { user } = useAuth();
  const [selectedSeason, setSelectedSeason] = useState<string>("2025");
  const [selectedWeek, setSelectedWeek] = useState<string>("10");

  // Query user leagues
  const { data: leagues } = useQuery<any[]>({
    queryKey: ["/api/leagues"],
    enabled: !!user,
  });

  // Query NFL matchups for selected week
  const { data: matchupsData, isLoading: matchupsLoading } = useNFLMatchups(
    parseInt(selectedSeason), 
    parseInt(selectedWeek)
  );
  const nflMatchups = matchupsData?.matchups || [];

  // Query defensive rankings for selected week
  const { data: rankingsData, isLoading: rankingsLoading } = useDefensiveRankings(
    parseInt(selectedSeason), 
    parseInt(selectedWeek)
  );
  const defensiveRankings = rankingsData?.rankings || {};

  // Transform rankings object into sorted array
  const rankingsArray = Object.entries(defensiveRankings)
    .map(([team, rank]) => ({ team, rank: rank as number }))
    .sort((a, b) => a.rank - b.rank);

  // Helper function to get rank color
  const getRankColor = (rank: number) => {
    if (rank >= 27) return "text-green-600 bg-green-50 border-green-200";
    if (rank >= 20) return "text-blue-600 bg-blue-50 border-blue-200";
    if (rank >= 13) return "text-yellow-600 bg-yellow-50 border-yellow-200";
    return "text-red-600 bg-red-50 border-red-200";
  };

  const getRankLabel = (rank: number) => {
    if (rank >= 27) return "Easiest";
    if (rank >= 20) return "Easy";
    if (rank >= 13) return "Average";
    return "Tough";
  };

  return (
    <>
      {/* Header Bar */}
      <header className="bg-card border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center space-x-3">
              <h2 className="text-2xl font-bold text-foreground">OPRK Sandbox</h2>
              <Badge variant="outline" className="bg-purple-500/20 text-purple-700 dark:text-purple-300">
                Developer Tool
              </Badge>
            </div>
            <p className="text-muted-foreground">Test and validate defensive rankings (OPRK) data</p>
          </div>
          <div className="flex items-center space-x-3">
            <Select value={selectedSeason} onValueChange={setSelectedSeason}>
              <SelectTrigger className="w-24" data-testid="select-season">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2025">2025</SelectItem>
                <SelectItem value="2024">2024</SelectItem>
                <SelectItem value="2023">2023</SelectItem>
              </SelectContent>
            </Select>

            <Select value={selectedWeek} onValueChange={setSelectedWeek}>
              <SelectTrigger className="w-32" data-testid="select-week">
                <SelectValue placeholder="Select week" />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 18 }, (_, i) => i + 1).map((week) => (
                  <SelectItem key={week} value={week.toString()}>
                    Week {week}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant="secondary"
              onClick={() => {
                queryClient.invalidateQueries({ 
                  queryKey: ['/api/nfl/matchups', parseInt(selectedSeason), parseInt(selectedWeek)]
                });
                queryClient.invalidateQueries({ 
                  queryKey: ['/api/nfl/defensive-rankings', parseInt(selectedSeason), parseInt(selectedWeek)]
                });
              }}
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Defensive Rankings Card */}
          <Card data-testid="card-defensive-rankings">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <FlaskConical className="w-5 h-5" />
                <span>Defensive Rankings</span>
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Teams ranked by points allowed per game (1 = best defense)
              </p>
            </CardHeader>
            <CardContent>
              {rankingsLoading ? (
                <div className="space-y-3">
                  {[...Array(10)].map((_, i) => (
                    <div key={i} className="animate-pulse flex space-x-4">
                      <div className="w-12 h-8 bg-muted rounded"></div>
                      <div className="flex-1 h-8 bg-muted rounded"></div>
                    </div>
                  ))}
                </div>
              ) : rankingsArray.length > 0 ? (
                <div className="rounded-md border max-h-[600px] overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-muted/50 z-10">
                      <TableRow>
                        <TableHead className="font-semibold w-20">Rank</TableHead>
                        <TableHead className="font-semibold">Team</TableHead>
                        <TableHead className="font-semibold text-right">Matchup Difficulty</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rankingsArray.map(({ team, rank }) => (
                        <TableRow key={team} className="hover:bg-muted/30">
                          <TableCell>
                            <Badge variant="outline" className={`font-medium ${getRankColor(rank)}`}>
                              {rank}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-medium">{team}</TableCell>
                          <TableCell className="text-right">
                            <span className={`text-sm font-medium ${getRankColor(rank).split(' ')[0]}`}>
                              {getRankLabel(rank)}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-8">
                  <Info className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">
                    No defensive rankings data available for Week {selectedWeek}
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Run the "Sync NFL Team Stats" job to populate rankings data
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Matchups Card */}
          <Card data-testid="card-matchups">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <FlaskConical className="w-5 h-5" />
                <span>NFL Matchups</span>
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Week {selectedWeek} matchup schedule
              </p>
            </CardHeader>
            <CardContent>
              {matchupsLoading ? (
                <div className="space-y-3">
                  {[...Array(10)].map((_, i) => (
                    <div key={i} className="animate-pulse flex space-x-4">
                      <div className="flex-1 h-8 bg-muted rounded"></div>
                    </div>
                  ))}
                </div>
              ) : nflMatchups.length > 0 ? (
                <div className="rounded-md border max-h-[600px] overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-muted/50 z-10">
                      <TableRow>
                        <TableHead className="font-semibold">Team</TableHead>
                        <TableHead className="font-semibold">Opponent</TableHead>
                        <TableHead className="font-semibold">Game Day</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {nflMatchups.map((matchup: any) => (
                        <TableRow key={matchup.id} className="hover:bg-muted/30">
                          <TableCell className="font-medium">{matchup.teamAbbr}</TableCell>
                          <TableCell>
                            <span className={matchup.isHome ? "text-blue-600" : "text-purple-600"}>
                              {matchup.isHome ? "vs" : "@"} {matchup.opponentAbbr}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {matchup.gameDay}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-8">
                  <Info className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">
                    No matchup data available for Week {selectedWeek}
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Run the "Sync NFL Matchups" job to populate matchup data
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Info Card */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Info className="w-5 h-5" />
              <span>About OPRK</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="font-semibold mb-2">What is OPRK?</h3>
              <p className="text-sm text-muted-foreground">
                OPRK (Opponent Rank) represents how difficult an opponent's defense is to score against. 
                Rankings are based on points allowed per game throughout the season.
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-2">How to Read Rankings</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center space-x-2">
                  <Badge variant="outline" className="text-red-600 bg-red-50 border-red-200">1-12</Badge>
                  <span><strong className="text-red-600">Tough Matchup</strong> - Best defenses, allow fewest points</span>
                </li>
                <li className="flex items-center space-x-2">
                  <Badge variant="outline" className="text-yellow-600 bg-yellow-50 border-yellow-200">13-19</Badge>
                  <span><strong className="text-yellow-600">Average Matchup</strong> - Middle-tier defenses</span>
                </li>
                <li className="flex items-center space-x-2">
                  <Badge variant="outline" className="text-blue-600 bg-blue-50 border-blue-200">20-26</Badge>
                  <span><strong className="text-blue-600">Easy Matchup</strong> - Weaker defenses</span>
                </li>
                <li className="flex items-center space-x-2">
                  <Badge variant="outline" className="text-green-600 bg-green-50 border-green-200">27-32</Badge>
                  <span><strong className="text-green-600">Easiest Matchup</strong> - Worst defenses, allow most points</span>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-2">Usage in Player Details</h3>
              <p className="text-sm text-muted-foreground">
                The Player Details page shows each player's opponent's defensive rank to help you make informed 
                start/sit decisions. Green badges indicate favorable matchups, while red badges indicate tough matchups.
              </p>
            </div>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
