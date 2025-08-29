import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RefreshCw, UsersRound, Search, Download } from "lucide-react";
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

  // Query players data
  const { data: playersData, isLoading: playersLoading } = useQuery({
    queryKey: ["/api/players", selectedSport, selectedSeason, userId],
    queryFn: async () => {
      const response = await fetch(`/api/players/${selectedSport}/${selectedSeason}?userId=${userId}`);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch players: ${response.status} ${errorText}`);
      }
      return response.json();
    },
    enabled: !!selectedSport && !!selectedSeason && viewMode === "all",
  });

  // Query user leagues
  const { data: leagues } = useQuery({
    queryKey: ["/api/leagues", userId],
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

  // Helper function to get injury status
  const getInjuryStatus = (playerData: any) => {
    const player = playerData.player || playerData;
    return player.injured || player.injuryStatus === 'INJURED' ? 'Injured' : 'Active';
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
                  window.open(`/api/leagues/${selectedLeagueId}/waiver-wire/export`, '_blank');
                }}
                data-testid="button-export-waiver"
              >
                <Download className="w-4 h-4 mr-2" />
                Export CSV
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
                {viewMode === "waiver" && waiverWireData && typeof waiverWireData === 'object' && 'total' in waiverWireData && (
                  <Badge variant="secondary" className="ml-2">
                    {(waiverWireData as any).total} available
                  </Badge>
                )}
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
                    <TableRow>
                      <TableHead>Player</TableHead>
                      <TableHead>Position</TableHead>
                      <TableHead>Team</TableHead>
                      <TableHead>% Owned</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPlayers.slice(0, 100).map((player: any) => (
                      <TableRow
                        key={player.id}
                        className="hover:bg-muted/50"
                        data-testid={`row-player-${player.id}`}
                      >
                        <TableCell>
                          <div className="font-medium text-foreground">
                            {getPlayerName(player)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge 
                            className={`${getPositionColor(getPlayerPositionId(player))} text-white`}
                          >
                            {getPositionName(getPlayerPositionId(player))}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">
                            {getProTeamId(player) ? `Team ${getProTeamId(player)}` : "Free Agent"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-foreground">
                            {getOwnershipPercent(player)}%
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={getInjuryStatus(player) === "Injured" ? "destructive" : "default"}>
                            {getInjuryStatus(player)}
                          </Badge>
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
