import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Loader2 } from "lucide-react";
import { AlertCircle, TrendingUp, Users, Star } from "lucide-react";
import { useSelectedLeague } from "@/hooks/useSelectedLeague";

interface Player {
  name: string;
  position: string;
  isStarter: boolean;
  playerId: number;
}

interface TradeOption {
  targetTeam: string;
  targetTeamId: string;
  playersOffered: string[];
  playersRequested: string[];
  tradeRationale: string;
  fairnessRating: number;
  benefitAnalysis: string;
}

interface TradeAnalysis {
  selectedPlayer: string;
  playerValue: string;
  tradeOptions: TradeOption[];
  marketAnalysis: string;
  summary: string;
}

// Helper function for position mapping
const getPositionName = (positionId: number): string => {
  const positions: { [key: number]: string } = {
    1: 'QB', 2: 'RB', 3: 'WR', 4: 'TE', 5: 'K', 16: 'D/ST'
  };
  return positions[positionId] || `POS_${positionId}`;
};

export default function TradeAnalyzer() {
  const [userId] = useState("default-user");
  const { selectedLeagueId, setSelectedLeagueId, leagues, hasAutoSelected } = useSelectedLeague(userId);
  const [selectedPlayer, setSelectedPlayer] = useState<string>("");
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");

  // Find the selected league object
  const selectedLeague = leagues?.find((l: any) => l.id === selectedLeagueId);

  // Fetch roster data
  const { data: rostersData, isLoading: rostersLoading } = useQuery({
    queryKey: ["/api/leagues", selectedLeagueId, "rosters"],
    enabled: !!selectedLeagueId,
    staleTime: 5 * 60 * 1000 // 5 minutes
  });

  // Get all teams
  const teams = rostersData?.teams || [];

  // Set default selected team to user's team on load
  useEffect(() => {
    if (teams.length > 0 && !selectedTeamId) {
      setSelectedTeamId(teams[0].id.toString());
    }
  }, [teams, selectedTeamId]);

  // Find selected team object
  const selectedTeam = teams.find((t: any) => t.id.toString() === selectedTeamId);

  // Get roster for selected team
  const selectedTeamRoster = selectedTeam?.roster?.entries?.map((entry: any) => ({
    name: entry.playerPoolEntry?.player?.fullName || 'Unknown Player',
    position: entry.playerPoolEntry?.player?.defaultPositionId ?
      getPositionName(entry.playerPoolEntry.player.defaultPositionId) : 'FLEX',
    isStarter: entry.lineupSlotId !== 20,
    playerId: entry.playerPoolEntry?.player?.id
  })) || [];

  // Trade analysis mutation
  const tradeAnalysisMutation = useMutation({
    mutationFn: async (data: { selectedPlayer: string, selectedTeamId: string }) => {
      const response = await apiRequest('POST', `/api/leagues/${selectedLeagueId}/trade-analysis`, data);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/leagues", selectedLeagueId, "trade-analysis"]
      });
    }
  });

  const handleAnalyzeTrade = () => {
    if (!selectedPlayer || !selectedTeamId) return;
    tradeAnalysisMutation.mutate({
      selectedPlayer,
      selectedTeamId
    });
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      case 'low': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    }
  };

  const getFairnessColor = (rating: number) => {
    if (rating >= 8) return 'text-green-600';
    if (rating >= 6) return 'text-yellow-600';
    return 'text-red-600';
  };

  // Create team name mapping from roster data
  const getTeamName = (teamId: string): string => {
    if (!rostersData?.teams) return teamId;

    // Extract team ID number from strings like "Team 4"
    const teamIdNumber = teamId.replace(/^Team\s+/, '');

    // Find team by matching both the original string and the extracted number
    const team = rostersData.teams.find((t: any) =>
      t.id.toString() === teamId.toString() ||
      t.id.toString() === teamIdNumber
    );

    if (team?.name && team.name !== `Team ${team.id}`) {
      return team.name;
    }

    return teamId; // Fallback to original team identifier
  };

  // Replace all "Team X" references in text with actual team names
  const replaceTeamNamesInText = (text: string): string => {
    if (!rostersData?.teams) return text;

    let updatedText = text;

    // Replace all instances of "Team X" with actual team names
    rostersData.teams.forEach((team: any) => {
      const teamPattern = new RegExp(`Team\\s+${team.id}`, 'g');
      if (team.name && team.name !== `Team ${team.id}`) {
        updatedText = updatedText.replace(teamPattern, team.name);
      }
    });

    return updatedText;
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="container mx-auto p-3 sm:p-6 space-y-4 sm:space-y-6" data-testid="trade-analyzer-page">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold" data-testid="page-title">Trade Analyzer</h1>
            <p className="text-muted-foreground text-sm sm:text-base" data-testid="page-description">
              Get AI-powered trade suggestions for your fantasy football team
            </p>
          </div>
        </div>

        {/* Team & Player Selection Card */}
        <Card data-testid="player-selection-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Select Team and Player to Trade
            </CardTitle>
            <CardDescription>
              Choose a team and player to analyze potential trade opportunities
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4">
              {/* Team Dropdown */}
              <div>
                <Select value={selectedTeamId} onValueChange={setSelectedTeamId} data-testid="team-select">
                  <SelectTrigger className="h-12 text-base">
                    <SelectValue placeholder="Choose a team..." />
                  </SelectTrigger>
                  <SelectContent>
                    {teams.map((team: any) => (
                      <SelectItem key={team.id} value={team.id.toString()}>
                        {team.name && team.name !== `Team ${team.id}` ? team.name : `Team ${team.id}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {/* Player Dropdown */}
              <div>
                <Select value={selectedPlayer} onValueChange={setSelectedPlayer} data-testid="player-select">
                  <SelectTrigger className="h-12 text-base">
                    <SelectValue placeholder="Choose a player..." />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedTeamRoster.map((player: Player) => (
                      <SelectItem key={`${player.playerId}-${player.name}`} value={player.name}>
                        <div className="flex items-center gap-2 py-1">
                          <Badge variant="outline" className="text-xs">
                            {player.position}
                          </Badge>
                          <span className="text-sm">{player.name}</span>
                          {player.isStarter && <Star className="h-3 w-3" />}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={handleAnalyzeTrade}
                disabled={!selectedPlayer || !selectedTeamId || tradeAnalysisMutation.isPending}
                className="w-full h-12 text-base"
                data-testid="analyze-trade-button"
              >
                {tradeAnalysisMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <TrendingUp className="mr-2 h-5 w-5" />
                    Analyze Trade Options
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Trade Analysis Results */}
        {tradeAnalysisMutation.data && (
          <div className="space-y-6" data-testid="trade-analysis-results">
            <Card>
              <CardHeader>
                <CardTitle>Trade Analysis for {(tradeAnalysisMutation.data as TradeAnalysis)?.selectedPlayer}</CardTitle>
                <CardDescription>
                  AI-powered insights based on your league's roster composition and scoring settings
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h3 className="font-semibold mb-2">Player Value Assessment</h3>
                  <p className="text-sm text-muted-foreground">{replaceTeamNamesInText((tradeAnalysisMutation.data as TradeAnalysis)?.playerValue || '')}</p>
                </div>
                
                <Separator />
                
                <div>
                  <h3 className="font-semibold mb-2">Market Analysis</h3>
                  <p className="text-sm text-muted-foreground">{replaceTeamNamesInText((tradeAnalysisMutation.data as TradeAnalysis)?.marketAnalysis || '')}</p>
                </div>

                <Separator />

                <div>
                  <h3 className="font-semibold mb-2">Summary</h3>
                  <p className="text-sm text-muted-foreground">{replaceTeamNamesInText((tradeAnalysisMutation.data as TradeAnalysis)?.summary || '')}</p>
                </div>
              </CardContent>
            </Card>

            {/* Trade Options */}
            <div className="grid gap-4" data-testid="trade-options">
              <h2 className="text-2xl font-bold">Trade Opportunities</h2>
              {((tradeAnalysisMutation.data as TradeAnalysis)?.tradeOptions || []).map((option: TradeOption, index: number) => (
                <Card key={index} data-testid={`trade-option-${index}`}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{getTeamName(option.targetTeam)}</CardTitle>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={getFairnessColor(option.fairnessRating)}>
                          {option.fairnessRating}/10 Fairness
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <h4 className="font-medium text-sm text-muted-foreground mb-2">You Give</h4>
                        <div className="flex flex-wrap gap-2">
                          {option.playersOffered.map((player, playerIndex) => (
                            <Badge key={playerIndex} variant="secondary" className="text-xs">
                              {player}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div>
                        <h4 className="font-medium text-sm text-muted-foreground mb-2">You Get</h4>
                        <div className="flex flex-wrap gap-2">
                          {option.playersRequested.map((player, playerIndex) => (
                            <Badge key={playerIndex} variant="default" className="text-xs">
                              {player}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>

                    <Separator />

                    <div>
                      <h4 className="font-medium mb-2">Trade Rationale</h4>
                      <p className="text-sm text-muted-foreground">{replaceTeamNamesInText(option.tradeRationale)}</p>
                    </div>

                    <div>
                      <h4 className="font-medium mb-2">Benefit Analysis</h4>
                      <p className="text-sm text-muted-foreground">{replaceTeamNamesInText(option.benefitAnalysis)}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Error handling */}
        {tradeAnalysisMutation.error && (
          <Card className="border-red-200" data-testid="error-message">
            <CardHeader>
              <CardTitle className="text-red-600 flex items-center gap-2">
                <AlertCircle className="h-5 w-5" />
                Analysis Error
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm">
                {tradeAnalysisMutation.error?.message || "Failed to analyze trade options"}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}