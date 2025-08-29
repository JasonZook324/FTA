import { useState } from "react";
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

export default function TradeAnalyzer() {
  const { selectedLeague } = useSelectedLeague();
  const [selectedPlayer, setSelectedPlayer] = useState<string>("");

  // Fetch roster data to show available players for trade analysis
  const { data: rostersData, isLoading: rostersLoading } = useQuery({
    queryKey: ["/api/leagues", selectedLeague?.id, "rosters"],
    enabled: !!selectedLeague?.id,
    staleTime: 5 * 60 * 1000 // 5 minutes
  });

  // Trade analysis mutation
  const tradeAnalysisMutation = useMutation({
    mutationFn: async (data: { selectedPlayer: string }) => {
      const response = await apiRequest(`/api/leagues/${selectedLeague?.id}/trade-analysis`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: ["/api/leagues", selectedLeague?.id, "trade-analysis"] 
      });
    }
  });

  if (!selectedLeague) {
    return (
      <div className="container mx-auto p-6" data-testid="no-league-selected">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              No League Selected
            </CardTitle>
            <CardDescription>
              Please select a league first to analyze trade opportunities.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (rostersLoading) {
    return (
      <div className="container mx-auto p-6 flex items-center justify-center">
        <div className="flex items-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>Loading roster data...</span>
        </div>
      </div>
    );
  }

  // Get user's team (first team in roster data)
  const userTeam = rostersData?.teams?.[0];
  const userRoster = userTeam?.roster?.entries?.map((entry: any) => ({
    name: entry.playerPoolEntry?.player?.fullName || 'Unknown Player',
    position: entry.playerPoolEntry?.player?.defaultPositionId ? 
      getPositionName(entry.playerPoolEntry.player.defaultPositionId) : 'FLEX',
    isStarter: entry.lineupSlotId !== 20, // 20 is typically bench
    playerId: entry.playerPoolEntry?.player?.id
  })) || [];

  const handleAnalyzeTrade = () => {
    if (!selectedPlayer) return;
    
    tradeAnalysisMutation.mutate({
      selectedPlayer
    });
  };

  const getPositionName = (positionId: number): string => {
    const positions: { [key: number]: string } = {
      1: 'QB', 2: 'RB', 3: 'WR', 4: 'TE', 5: 'K', 16: 'D/ST'
    };
    return positions[positionId] || `POS_${positionId}`;
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

  return (
    <div className="container mx-auto p-6 space-y-6" data-testid="trade-analyzer-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="page-title">Trade Analyzer</h1>
          <p className="text-muted-foreground" data-testid="page-description">
            Get AI-powered trade suggestions for your fantasy football team
          </p>
        </div>
      </div>

      {/* Player Selection Card */}
      <Card data-testid="player-selection-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Select Player to Trade
          </CardTitle>
          <CardDescription>
            Choose a player from your roster to analyze potential trade opportunities
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Select value={selectedPlayer} onValueChange={setSelectedPlayer} data-testid="player-select">
                <SelectTrigger>
                  <SelectValue placeholder="Choose a player..." />
                </SelectTrigger>
                <SelectContent>
                  {userRoster.map((player: Player) => (
                    <SelectItem key={`${player.playerId}-${player.name}`} value={player.name}>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {player.position}
                        </Badge>
                        {player.name}
                        {player.isStarter && <Star className="h-3 w-3" />}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={handleAnalyzeTrade}
              disabled={!selectedPlayer || tradeAnalysisMutation.isPending}
              className="w-full"
              data-testid="analyze-trade-button"
            >
              {tradeAnalysisMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <TrendingUp className="mr-2 h-4 w-4" />
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
                <p className="text-sm text-muted-foreground">{(tradeAnalysisMutation.data as TradeAnalysis)?.playerValue}</p>
              </div>
              
              <Separator />
              
              <div>
                <h3 className="font-semibold mb-2">Market Analysis</h3>
                <p className="text-sm text-muted-foreground">{(tradeAnalysisMutation.data as TradeAnalysis)?.marketAnalysis}</p>
              </div>

              <Separator />

              <div>
                <h3 className="font-semibold mb-2">Summary</h3>
                <p className="text-sm text-muted-foreground">{(tradeAnalysisMutation.data as TradeAnalysis)?.summary}</p>
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
                    <CardTitle className="text-lg">{option.targetTeam}</CardTitle>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={getFairnessColor(option.fairnessRating)}>
                        {option.fairnessRating}/10 Fairness
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <h4 className="font-medium text-sm text-muted-foreground mb-2">You Give</h4>
                      <div className="space-y-1">
                        {option.playersOffered.map((player, playerIndex) => (
                          <Badge key={playerIndex} variant="secondary" className="mr-2">
                            {player}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div>
                      <h4 className="font-medium text-sm text-muted-foreground mb-2">You Get</h4>
                      <div className="space-y-1">
                        {option.playersRequested.map((player, playerIndex) => (
                          <Badge key={playerIndex} variant="default" className="mr-2">
                            {player}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div>
                    <h4 className="font-medium mb-2">Trade Rationale</h4>
                    <p className="text-sm text-muted-foreground">{option.tradeRationale}</p>
                  </div>

                  <div>
                    <h4 className="font-medium mb-2">Benefit Analysis</h4>
                    <p className="text-sm text-muted-foreground">{option.benefitAnalysis}</p>
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
  );
}