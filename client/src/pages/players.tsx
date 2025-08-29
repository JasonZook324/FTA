import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RefreshCw, UsersRound, Search } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function Players() {
  const [userId] = useState("default-user");
  const [selectedSport, setSelectedSport] = useState<string>("ffl");
  const [selectedSeason, setSelectedSeason] = useState<string>("2025");
  const [searchTerm, setSearchTerm] = useState<string>("");

  // Query players data
  const { data: playersData, isLoading: playersLoading } = useQuery({
    queryKey: ["/api/players", selectedSport, selectedSeason],
    queryParams: { userId },
    enabled: !!selectedSport && !!selectedSeason,
  });

  const filteredPlayers = playersData?.players?.filter((player: any) =>
    player.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (player.proTeamId && player.proTeamId.toString().includes(searchTerm))
  ) || [];

  const getPositionColor = (positionId: number) => {
    const colors: Record<number, string> = {
      1: "bg-chart-1", // QB
      2: "bg-chart-2", // RB
      3: "bg-chart-3", // WR
      4: "bg-chart-4", // TE
      5: "bg-chart-5", // K
      16: "bg-secondary", // DEF
    };
    return colors[positionId] || "bg-muted";
  };

  const getPositionName = (positionId: number) => {
    const positions: Record<number, string> = {
      1: "QB",
      2: "RB", 
      3: "WR",
      4: "TE",
      5: "K",
      16: "DEF",
    };
    return positions[positionId] || "UNK";
  };

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
            
            <Button
              variant="secondary"
              onClick={() => queryClient.invalidateQueries({ 
                queryKey: ["/api/players", selectedSport, selectedSeason] 
              })}
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
        <Card data-testid="card-players">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center space-x-2">
                <UsersRound className="w-5 h-5" />
                <span>Player Database</span>
              </CardTitle>
              <div className="flex items-center space-x-2">
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
            {playersLoading ? (
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
                            {player.fullName}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge 
                            className={`${getPositionColor(player.defaultPositionId)} text-white`}
                          >
                            {getPositionName(player.defaultPositionId)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">
                            {player.proTeamId ? `Team ${player.proTeamId}` : "Free Agent"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-foreground">
                            {player.ownership?.percentOwned?.toFixed(1) || "0.0"}%
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={player.injured ? "destructive" : "default"}>
                            {player.injured ? "Injured" : "Active"}
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
                  {searchTerm ? "No players found matching your search" : "No player data available"}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </>
  );
}
