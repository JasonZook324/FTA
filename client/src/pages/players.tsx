import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RefreshCw, UsersRound, Search, Download, Plus, Eye } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { queryClient } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function Players() {
  const [userId] = useState("default-user");
  const [selectedSport, setSelectedSport] = useState<string>("ffl");
  const [selectedSeason, setSelectedSeason] = useState<string>("2025");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [selectedLeagueId, setSelectedLeagueId] = useState<string>("");
  const [viewMode, setViewMode] = useState<"all" | "waiver">("all");
  const [selectedPosition, setSelectedPosition] = useState<string>("all");

  // Query user leagues
  const { data: leagues } = useQuery<any[]>({
    queryKey: ["/api/leagues", userId],
  });

  // Auto-select the first league when leagues load
  useEffect(() => {
    if (leagues && leagues.length > 0 && !selectedLeagueId) {
      setSelectedLeagueId(leagues[0].id);
    }
  }, [leagues, selectedLeagueId]);

  // Query players data
  const { data: playersData, isLoading: playersLoading } = useQuery({
    queryKey: ["/api/players", selectedSport, selectedSeason, userId, selectedLeagueId],
    queryFn: async () => {
      const leagueParam = selectedLeagueId ? `&leagueId=${selectedLeagueId}` : '';
      const response = await fetch(`/api/players/${selectedSport}/${selectedSeason}?userId=${userId}${leagueParam}`);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch players: ${response.status} ${errorText}`);
      }
      return response.json();
    },
    enabled: !!selectedSport && !!selectedSeason && viewMode === "all",
  });

  // Query waiver wire data
  const { data: waiverWireData, isLoading: waiverWireLoading } = useQuery({
    queryKey: ["/api/leagues", selectedLeagueId, "waiver-wire"],
    enabled: !!selectedLeagueId && viewMode === "waiver",
  });

  const currentData = viewMode === "waiver" ? waiverWireData : playersData;
  const currentLoading = viewMode === "waiver" ? waiverWireLoading : playersLoading;

  // Helper function to get player name from various possible fields
  const getPlayerName = (playerData: any) => {
    // The actual player info is nested in playerData.player
    const player = playerData.player || playerData;
    
    if (player.fullName) return player.fullName;
    if (player.name) return player.name;
    if (player.displayName) return player.displayName;
    if (player.firstName && player.lastName) return `${player.firstName} ${player.lastName}`;
    
    return 'Unknown Player';
  };

  // Helper function to get position ID from various possible fields
  const getPlayerPositionId = (playerData: any) => {
    // The actual player info is nested in playerData.player
    const player = playerData.player || playerData;
    return player.defaultPositionId ?? player.positionId ?? player.position ?? 0;
  };

  // Helper function to get ownership percentage
  const getOwnershipPercent = (playerData: any) => {
    const player = playerData.player || playerData;
    return player.ownership?.percentOwned?.toFixed(1) || "0.0";
  };

  // Helper function to get pro team ID
  const getProTeamId = (playerData: any) => {
    const player = playerData.player || playerData;
    return player.proTeamId;
  };

  // Helper function to get detailed injury status
  const getInjuryStatus = (playerData: any) => {
    const player = playerData.player || playerData;
    
    // Return the actual injury status from ESPN, or default to Active
    const status = player.injuryStatus || (player.injured ? 'INJURED' : 'ACTIVE');
    
    // Convert ESPN status codes to display text
    switch (status) {
      case 'ACTIVE':
        return 'Active';
      case 'QUESTIONABLE':
        return 'Questionable';
      case 'DOUBTFUL':
        return 'Doubtful';
      case 'OUT':
        return 'Out';
      case 'IR':
        return 'IR';
      case 'INJURED':
        return 'Injured';
      default:
        return player.injured ? 'Injured' : 'Active';
    }
  };

  // Helper function to get injury status badge variant
  const getInjuryStatusVariant = (status: string) => {
    switch (status) {
      case 'Active':
        return 'default';
      case 'Questionable':
        return 'secondary';
      case 'Doubtful':
        return 'secondary';
      case 'Out':
        return 'destructive';
      case 'IR':
        return 'destructive';
      case 'Injured':
        return 'destructive';
      default:
        return 'default';
    }
  };

  // Helper function to get game time/status
  const getGameTime = (playerData: any) => {
    const player = playerData.player || playerData;
    // For now, return a placeholder time
    return "Sun 1:00 PM";
  };

  // Helper function to get position rank based on opponent defense from live ESPN data
  const getPositionRank = (playerData: any) => {
    const player = playerData.player || playerData;
    
    // First priority: Direct opponent rank from ESPN API
    if (player.opponentRank !== undefined && player.opponentRank !== null) {
      return player.opponentRank.toString();
    }
    
    // Second priority: Check ESPN's defense rankings data structure
    if (player.defenseRankings && typeof player.defenseRankings === 'object') {
      const position = getPositionName(getPlayerPositionId(player));
      const defenseRank = player.defenseRankings[`vs${position}`] || player.defenseRankings[position.toLowerCase()];
      if (defenseRank !== undefined && defenseRank !== null) {
        return defenseRank.toString();
      }
    }
    
    // Third priority: Check kona_player_rankings data
    if (player.playerRankings && typeof player.playerRankings === 'object') {
      const currentWeek = getCurrentNFLWeek();
      const weeklyRanking = player.playerRankings[currentWeek] || player.playerRankings.current;
      if (weeklyRanking && weeklyRanking.opponentRank !== undefined) {
        return weeklyRanking.opponentRank.toString();
      }
    }
    
    // Fourth priority: Check stats for opponent ranking data
    if (player.stats && Array.isArray(player.stats)) {
      for (const stat of player.stats) {
        if (stat.opponentRank !== undefined && stat.opponentRank !== null) {
          return stat.opponentRank.toString();
        }
        // ESPN sometimes stores it in stat details
        if (stat.statDetail && stat.statDetail.opponentRank) {
          return stat.statDetail.opponentRank.toString();
        }
        // Check for defense vs position stats
        if (stat.opponentDefenseVsPosition !== undefined) {
          return stat.opponentDefenseVsPosition.toString();
        }
      }
    }
    
    // Fifth priority: Check player outlook for matchup data
    if (player.outlook) {
      if (player.outlook.opponentRank !== undefined && player.outlook.opponentRank !== null) {
        return player.outlook.opponentRank.toString();
      }
      // Check outlook stats
      if (player.outlook.stats && player.outlook.stats.opponentRank) {
        return player.outlook.stats.opponentRank.toString();
      }
      // Check outlook matchup data
      if (player.outlook.defenseRank !== undefined && player.outlook.defenseRank !== null) {
        return player.outlook.defenseRank.toString();
      }
    }
    
    // Sixth priority: Check rankings object for positional rankings
    if (player.rankings && typeof player.rankings === 'object') {
      // ESPN sometimes stores opponent rankings by week/position
      for (const rankKey in player.rankings) {
        const ranking = player.rankings[rankKey];
        if (ranking && ranking.opponentRank !== undefined) {
          return ranking.opponentRank.toString();
        }
        if (ranking && ranking.defenseRank !== undefined) {
          return ranking.defenseRank.toString();
        }
      }
    }
    
    // Seventh priority: Check ESPN's game/matchup data structure
    if (player.game && typeof player.game === 'object') {
      const opponentDefense = player.game.opponentDefenseRank || player.game.defenseRank;
      if (opponentDefense !== undefined && opponentDefense !== null) {
        return opponentDefense.toString();
      }
    }
    
    // Eighth priority: Check if there's schedule/matchup data with opponent defense stats
    if (player.schedule && Array.isArray(player.schedule)) {
      const currentGame = player.schedule.find((game: any) => 
        game.isCurrentWeek || game.isThisWeek || game.isActive
      );
      if (currentGame && currentGame.opponentDefenseRank) {
        return currentGame.opponentDefenseRank.toString();
      }
      if (currentGame && currentGame.defenseRank) {
        return currentGame.defenseRank.toString();
      }
    }
    
    // Ninth priority: Check player's team schedule data
    if (player.teamSchedule && Array.isArray(player.teamSchedule)) {
      const currentMatchup = player.teamSchedule.find((matchup: any) => 
        matchup.isCurrentWeek || matchup.week === getCurrentNFLWeek()
      );
      if (currentMatchup && currentMatchup.defenseRank) {
        return currentMatchup.defenseRank.toString();
      }
    }
    
    // Tenth priority: Check if opponent team data includes defensive rankings
    const opponentTeamId = getOpponentTeamId(player);
    if (opponentTeamId && player.opponentTeamStats) {
      const position = getPositionName(getPlayerPositionId(player));
      const defenseVsPosition = player.opponentTeamStats[`defense_vs_${position.toLowerCase()}`];
      if (defenseVsPosition && defenseVsPosition.rank) {
        return defenseVsPosition.rank.toString();
      }
    }
    
    // Eleventh priority: Check ESPN's proOpponent and team defense data
    if (player.proOpponent !== undefined && player.teamDefenseRankings) {
      const position = getPositionName(getPlayerPositionId(player));
      const opponentDefense = player.teamDefenseRankings[player.proOpponent];
      if (opponentDefense && opponentDefense[position.toLowerCase()]) {
        return opponentDefense[position.toLowerCase()].toString();
      }
    }
    
    // If no live ESPN data is available, return empty
    console.warn('No opponent rank data found in ESPN API for player:', getPlayerName(player));
    return "--";
  };
  
  // Helper function to get current NFL week
  const getCurrentNFLWeek = () => {
    const currentDate = new Date();
    const seasonStart = new Date('2025-09-01'); // Approximate NFL season start
    const weeksPassed = Math.floor((currentDate.getTime() - seasonStart.getTime()) / (7 * 24 * 60 * 60 * 1000));
    return Math.max(1, Math.min(18, weeksPassed + 1));
  };
  
  // Helper function to get opponent team ID from live ESPN data
  const getOpponentTeamId = (player: any) => {
    // First check direct opponent field
    if (player.opponent && player.opponent.teamId) {
      return player.opponent.teamId;
    }
    
    // Check schedule for current week opponent
    if (player.schedule && Array.isArray(player.schedule)) {
      const currentGame = player.schedule.find((game: any) => 
        game.isCurrentWeek || game.isThisWeek
      );
      if (currentGame) {
        return currentGame.opponentTeamId || currentGame.opponent;
      }
    }
    
    // Check ESPN's proOpponent field
    if (player.proOpponent !== undefined && player.proOpponent > 0) {
      return player.proOpponent;
    }
    
    return null;
  };

  // Helper function to get position rank color based on actual ranking
  const getPositionRankColor = (playerData: any) => {
    const ranking = parseInt(getPositionRank(playerData));
    if (isNaN(ranking)) return "text-gray-600 bg-gray-50 border-gray-200";
    
    if (ranking <= 5) return "text-green-600 bg-green-50 border-green-200"; // Great matchup
    if (ranking <= 12) return "text-blue-600 bg-blue-50 border-blue-200"; // Good matchup
    if (ranking <= 20) return "text-yellow-600 bg-yellow-50 border-yellow-200"; // Average matchup
    return "text-red-600 bg-red-50 border-red-200"; // Tough matchup
  };

  // Helper function to get season fantasy points
  const getSeasonPoints = (playerData: any) => {
    const player = playerData.player || playerData;
    // Look for season stats
    const seasonStats = player.stats?.find((stat: any) => stat.statSourceId === 0 && stat.statSplitTypeId === 0);
    if (seasonStats?.appliedTotal !== undefined) {
      return seasonStats.appliedTotal.toFixed(1);
    }
    return "--";
  };

  // Helper function to get team name from pro team ID
  const getTeamName = (teamId: number) => {
    const teamNames: Record<number, string> = {
      1: "ATL", 2: "BUF", 3: "CHI", 4: "CIN", 5: "CLE", 6: "DAL", 7: "DEN", 8: "DET",
      9: "GB", 10: "TEN", 11: "IND", 12: "KC", 13: "LV", 14: "LAR", 15: "MIA", 16: "MIN",
      17: "NE", 18: "NO", 19: "NYG", 20: "NYJ", 21: "PHI", 22: "ARI", 23: "PIT", 24: "LAC",
      25: "SF", 26: "SEA", 27: "TB", 28: "WAS", 29: "CAR", 30: "JAX", 33: "BAL", 34: "HOU"
    };
    return teamNames[teamId] || `Team ${teamId}`;
  };

  // Helper function to get projected fantasy points
  const getProjectedPoints = (playerData: any) => {
    const player = playerData.player || playerData;
    
    // Get current scoring period from waiver wire data
    const currentWeek = (waiverWireData as any)?.currentScoringPeriodId || 5;
    
    // ESPN stores projections in the stats array
    // statSourceId: 1 = projected (0 = actual)
    // statSplitTypeId: 1 = weekly (0 = cumulative/season)
    if (player.stats && Array.isArray(player.stats)) {
      // First try to find current week projections
      let matchingStats = player.stats.filter((stat: any) => 
        stat.statSourceId === 1 && 
        stat.statSplitTypeId === 1 && 
        stat.scoringPeriodId === currentWeek
      );
      
      // If no current week projections, try to find any recent weekly projections
      if (matchingStats.length === 0) {
        const weeklyProjections = player.stats.filter((stat: any) => 
          stat.statSourceId === 1 && 
          stat.statSplitTypeId === 1
        );
        
        // Use the most recent weekly projection
        if (weeklyProjections.length > 0) {
          // Sort by scoring period descending and take the first (most recent)
          matchingStats = weeklyProjections.sort((a: any, b: any) => b.scoringPeriodId - a.scoringPeriodId).slice(0, 1);
        }
      }
      
      const weeklyProjection = matchingStats.length > 0 ? matchingStats[0] : null;
      
      if (weeklyProjection?.appliedTotal !== undefined) {
        return weeklyProjection.appliedTotal.toFixed(1);
      }
    }
    
    // Fallback: try other projection locations
    if (player.projectedStats?.appliedTotal !== undefined) {
      return player.projectedStats.appliedTotal.toFixed(1);
    }
    
    return "0.0";
  };

  // Helper function to get opponent team
  const getOpponent = (playerData: any) => {
    const player = playerData.player || playerData;
    
    // ESPN Fantasy API doesn't provide opponent data in player endpoints
    // This would require NFL schedule data from a different source
    return "N/A";
  };

  // Helper function to get game status/time
  const getGameStatus = (playerData: any) => {
    const player = playerData.player || playerData;
    const gameInfo = player.gameStatus || 
                    player.schedule?.find((game: any) => game.isThisWeek) ||
                    player.nextGame;
    
    if (gameInfo?.gameTime) {
      return new Date(gameInfo.gameTime).toLocaleDateString();
    }
    if (gameInfo?.status) {
      return gameInfo.status;
    }
    return "-";
  };

  const getPositionColor = (positionId: number) => {
    const colors: Record<number, string> = {
      0: "bg-chart-1", // QB
      1: "bg-chart-1", // QB
      2: "bg-chart-2", // RB
      3: "bg-chart-3", // WR
      4: "bg-chart-4", // TE
      5: "bg-chart-5", // K
      16: "bg-secondary", // DEF
      17: "bg-chart-5", // K
      23: "bg-muted", // FLEX
    };
    return colors[positionId] || "bg-muted";
  };

  const getPositionName = (positionId: number) => {
    const positions: Record<number, string> = {
      0: "QB",
      1: "QB",
      2: "RB", 
      3: "WR",
      4: "TE",
      5: "K",
      16: "DEF",
      17: "K",
      23: "FLEX",
    };
    return positions[positionId] || `POS_${positionId}`;
  };

  const filteredPlayers = currentData?.players?.filter((playerData: any) => {
    // Position filter
    if (selectedPosition !== "all") {
      const playerPosition = getPositionName(getPlayerPositionId(playerData));
      if (playerPosition !== selectedPosition) {
        return false;
      }
    }
    
    // Search filter
    if (searchTerm) {
      const name = getPlayerName(playerData);
      const teamId = getProTeamId(playerData) ? getProTeamId(playerData).toString() : '';
      
      if (!name.toLowerCase().includes(searchTerm.toLowerCase()) && !teamId.includes(searchTerm)) {
        return false;
      }
    }
    
    return true;
  }) || [];

  return (
    <>
      {/* Header Bar */}
      <header className="bg-card border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Player Details</h2>
            <p className="text-muted-foreground">Browse player statistics and information</p>
          </div>
          <div className="flex items-center space-x-3">
            {viewMode === "waiver" && (
              <>
                <div className="text-sm text-muted-foreground">League:</div>
                <Select value={selectedLeagueId} onValueChange={setSelectedLeagueId}>
                  <SelectTrigger className="w-48" data-testid="select-league">
                    <SelectValue placeholder="Select a league" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.isArray(leagues) && leagues.length > 0 ? leagues.map((league: any) => (
                      <SelectItem key={league.id} value={league.id}>
                        {league.name} ({league.season})
                      </SelectItem>
                    )) : (
                      <SelectItem value="no-leagues" disabled>No leagues found - load a league first</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </>
            )}
            
            <Select value={selectedSport} onValueChange={setSelectedSport}>
              <SelectTrigger className="w-40" data-testid="select-sport">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ffl">Football (NFL)</SelectItem>
                <SelectItem value="fba">Basketball (NBA)</SelectItem>
                <SelectItem value="fhk">Hockey (NHL)</SelectItem>
                <SelectItem value="flb">Baseball (MLB)</SelectItem>
              </SelectContent>
            </Select>
            
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
            
            {viewMode === "waiver" && selectedLeagueId && (
              <Button
                variant="outline"
                onClick={() => {
                  // Add timestamp to prevent caching
                  const url = `/api/leagues/${selectedLeagueId}/waiver-wire/export?t=${Date.now()}`;
                  window.open(url, '_blank');
                }}
                data-testid="button-export-waiver"
              >
                <Download className="w-4 h-4 mr-2" />
                Export Waiver Wire
              </Button>
            )}
            
            {selectedLeagueId && (
              <Button
                variant="outline"
                onClick={() => {
                  // Add timestamp to prevent caching
                  const url = `/api/leagues/${selectedLeagueId}/roster-export?t=${Date.now()}`;
                  window.open(url, '_blank');
                }}
                data-testid="button-export-rosters"
              >
                <Download className="w-4 h-4 mr-2" />
                Export Team Rosters
              </Button>
            )}
            
            <Button
              variant="secondary"
              onClick={() => {
                if (viewMode === "waiver" && selectedLeagueId) {
                  queryClient.invalidateQueries({ 
                    queryKey: ["/api/leagues", selectedLeagueId, "waiver-wire"] 
                  });
                } else {
                  queryClient.invalidateQueries({ 
                    queryKey: ["/api/players", selectedSport, selectedSeason] 
                  });
                }
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
        <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as "all" | "waiver")} className="mb-6">
          <TabsList>
            <TabsTrigger value="all" data-testid="tab-all-players">All Players</TabsTrigger>
            <TabsTrigger value="waiver" data-testid="tab-waiver-wire">Waiver Wire</TabsTrigger>
          </TabsList>
        </Tabs>

        <Card data-testid="card-players">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center space-x-2">
                <UsersRound className="w-5 h-5" />
                <span>{viewMode === "waiver" ? "Waiver Wire Players" : "Player Database"}</span>
              </CardTitle>
              <div className="flex items-center space-x-2">
                <Select
                  value={selectedPosition}
                  onValueChange={setSelectedPosition}
                  data-testid="select-position-filter"
                >
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="Position" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Positions</SelectItem>
                    <SelectItem value="QB">QB</SelectItem>
                    <SelectItem value="RB">RB</SelectItem>
                    <SelectItem value="WR">WR</SelectItem>
                    <SelectItem value="TE">TE</SelectItem>
                    <SelectItem value="K">K</SelectItem>
                    <SelectItem value="DEF">DEF</SelectItem>
                  </SelectContent>
                </Select>
                <Search className="w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search players..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-64"
                  data-testid="input-search-players"
                />
              </div>
            </div>
          </CardHeader>
          
          <CardContent>
            {viewMode === "waiver" && !selectedLeagueId ? (
              <div className="text-center py-8">
                <UsersRound className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">Select a league to view waiver wire players</p>
              </div>
            ) : currentLoading ? (
              <div className="space-y-3">
                {[...Array(10)].map((_, i) => (
                  <div key={i} className="animate-pulse flex space-x-4">
                    <div className="w-8 h-8 bg-muted rounded-full"></div>
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-muted rounded w-3/4"></div>
                      <div className="h-3 bg-muted rounded w-1/2"></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredPlayers.length > 0 ? (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-semibold">PLAYER</TableHead>
                      <TableHead className="font-semibold text-center">OPP</TableHead>
                      <TableHead className="font-semibold text-center">STATUS</TableHead>
                      <TableHead className="font-semibold text-center">PROJ</TableHead>
                      <TableHead className="font-semibold text-center">SCORE</TableHead>
                      <TableHead className="font-semibold text-center">OPRK</TableHead>
                      <TableHead className="font-semibold text-center">%ROST</TableHead>
                      <TableHead className="font-semibold text-center">+/-</TableHead>
                      <TableHead className="font-semibold text-center">FPTS</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPlayers.slice(0, 100).map((player: any) => (
                      <TableRow
                        key={player.id}
                        className="hover:bg-muted/30 border-b border-border/50"
                        data-testid={`row-player-${player.id}`}
                      >
                        <TableCell>
                          <div className="flex items-center space-x-3">
                            <div className="flex items-center space-x-2">
                              <Badge 
                                className={`${getPositionColor(getPlayerPositionId(player))} text-white text-xs`}
                              >
                                {getPositionName(getPlayerPositionId(player))}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {getProTeamId(player) ? getTeamName(getProTeamId(player)) : "FA"}
                              </span>
                            </div>
                            <div className="space-y-1">
                              <div className="font-medium text-sm">
                                {getPlayerName(player)}
                              </div>
                              {getInjuryStatus(player) !== 'Active' && (
                                <Badge 
                                  variant={getInjuryStatusVariant(getInjuryStatus(player))}
                                  className="text-xs"
                                >
                                  {getInjuryStatus(player)}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="text-xs font-medium text-blue-600">
                            {getOpponent(player)}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="text-xs">
                            {getGameTime(player)}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="text-xs font-medium">
                            {getProjectedPoints(player)}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="text-xs text-muted-foreground">
                            --
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className={`text-xs font-medium ${getPositionRankColor(player)}`}>
                            {getPositionRank(player)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="text-xs">
                            {getOwnershipPercent(player)}%
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="text-xs text-muted-foreground">
                            --
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="text-xs font-medium">
                            {getSeasonPoints(player)}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-8">
                <UsersRound className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">
                  {searchTerm ? "No players found matching your search" : 
                   viewMode === "waiver" ? "No waiver wire players available" : "No player data available"}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </>
  );
}
