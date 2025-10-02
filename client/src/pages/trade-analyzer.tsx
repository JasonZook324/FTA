import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Loader2, Copy, Check } from "lucide-react";
import { AlertCircle, TrendingUp, Users, Star } from "lucide-react";
import { useSelectedLeague } from "@/hooks/useSelectedLeague";
import { useToast } from "@/hooks/use-toast";
import { useTeam } from "@/contexts/TeamContext";

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
  const { toast } = useToast();
  const { selectedTeam } = useTeam();
  const { selectedLeagueId, setSelectedLeagueId, leagues, hasAutoSelected } = useSelectedLeague();
  const [selectedPlayer, setSelectedPlayer] = useState<string>("");
  const [copied, setCopied] = useState(false);

  // Find the selected league object
  const selectedLeague = leagues?.find((l: any) => l.id === selectedLeagueId);

  // Fetch roster data to show available players for trade analysis
  const { data: rostersData, isLoading: rostersLoading } = useQuery({
    queryKey: ["/api/leagues", selectedLeagueId, "rosters"],
    enabled: !!selectedLeagueId,
    staleTime: 5 * 60 * 1000 // 5 minutes
  });

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

  // Trade analysis mutation - now returns prompt instead of calling AI
  const tradeAnalysisMutation = useMutation({
    mutationFn: async (data: { selectedPlayer: string }) => {
      if (!selectedTeam) {
        throw new Error('Please select a team first');
      }
      const response = await apiRequest('POST', `/api/leagues/${selectedLeagueId}/trade-analysis-prompt`, {
        ...data,
        teamId: selectedTeam.teamId
      });
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: ["/api/leagues", selectedLeagueId, "trade-analysis-prompt"] 
      });
    }
  });

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

  if (!selectedLeagueId || !selectedLeague) {
    return (
      <div className="container mx-auto p-6" data-testid="no-league-selected">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              No League Selected
            </CardTitle>
            <CardDescription>
              {leagues.length === 0 
                ? "No leagues found. Please set up your ESPN credentials and import leagues first."
                : "Loading your league data..."}
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

  // Get user's selected team from roster data
  const userTeam = rostersData?.teams?.find((t: any) => t.id === selectedTeam?.teamId);
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
          <div className="grid grid-cols-1 gap-4">
            <div>
              <Select value={selectedPlayer} onValueChange={setSelectedPlayer} data-testid="player-select">
                <SelectTrigger className="h-12 text-base">
                  <SelectValue placeholder="Choose a player..." />
                </SelectTrigger>
                <SelectContent>
                  {userRoster.map((player: Player) => (
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
              disabled={!selectedPlayer || tradeAnalysisMutation.isPending}
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
                  Generate Trade Analysis Prompt
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Trade Analysis Prompt */}
      {tradeAnalysisMutation.data && (
        <Card data-testid="trade-analysis-prompt">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Trade Analysis Prompt for {selectedPlayer}</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => copyToClipboard((tradeAnalysisMutation.data as { prompt: string }).prompt)}
                data-testid="button-copy-trade-prompt"
              >
                {copied ? (
                  <><Check className="h-4 w-4 mr-2" /> Copied</>
                ) : (
                  <><Copy className="h-4 w-4 mr-2" /> Copy Prompt</>
                )}
              </Button>
            </CardTitle>
            <CardDescription>
              Copy this prompt and paste it into ChatGPT, Claude, or your preferred AI assistant to analyze trade opportunities
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="p-4 bg-muted rounded-lg border border-border max-h-96 overflow-y-auto">
              <pre className="text-sm whitespace-pre-wrap font-mono">{(tradeAnalysisMutation.data as { prompt: string }).prompt}</pre>
            </div>
          </CardContent>
        </Card>
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