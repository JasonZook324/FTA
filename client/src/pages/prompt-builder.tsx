import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  FileText, 
  Users, 
  User, 
  Search, 
  Copy, 
  Check, 
  Loader2,
  Settings,
  Crown,
  Globe
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTeam } from "@/contexts/TeamContext";
import { useAuth } from "@/hooks/use-auth";

export default function PromptBuilder() {
  const { toast } = useToast();
  const { selectedTeam, setSelectedTeam } = useTeam();
  const { user } = useAuth();
  const [selectedLeagueId, setSelectedLeagueId] = useState<string>("");
  const [customPrompt, setCustomPrompt] = useState("");
  const [copied, setCopied] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedPrompt, setGeneratedPrompt] = useState("");

  // Data inclusion options
  const [includeMyTeam, setIncludeMyTeam] = useState(true);
  const [includeOtherTeams, setIncludeOtherTeams] = useState("none"); // "none", "all", "specific"
  const [selectedOtherTeams, setSelectedOtherTeams] = useState<string[]>([]);
  const [includeWaiverWire, setIncludeWaiverWire] = useState("none"); // "none", "top50", "position", "team"
  const [waiverWirePosition, setWaiverWirePosition] = useState("");
  const [waiverWireTeam, setWaiverWireTeam] = useState("");
  const [excludeIRPlayers, setExcludeIRPlayers] = useState(false);
  const [excludeOutPlayers, setExcludeOutPlayers] = useState(false);
  const [excludeDoubtfulPlayers, setExcludeDoubtfulPlayers] = useState(false);
  const [excludeQuestionablePlayers, setExcludeQuestionablePlayers] = useState(false);
  const [includeLeagueSettings, setIncludeLeagueSettings] = useState(true);

  // Context data options
  const [includeFantasyPros, setIncludeFantasyPros] = useState(false);
  const [includeVegasOdds, setIncludeVegasOdds] = useState(false);
  const [includeInjuryReports, setIncludeInjuryReports] = useState(false);
  const [includeWeatherData, setIncludeWeatherData] = useState(false);
  const [includeNewsUpdates, setIncludeNewsUpdates] = useState(false);
  const [includeMatchupAnalysis, setIncludeMatchupAnalysis] = useState(false);

  // Player-level data options
  const [includePlayerNews, setIncludePlayerNews] = useState(false);
  const [includePlayerProjections, setIncludePlayerProjections] = useState(false);
  const [includePlayerRankings, setIncludePlayerRankings] = useState(false);

  // Query user leagues
  const { data: leagues } = useQuery({
    queryKey: ["/api/leagues"],
    enabled: !!user,
  });

  // Query teams for selected league
  const { data: teamsData, isLoading: isLoadingTeams } = useQuery<{ teams?: any[] }>({
    queryKey: ["/api/leagues", selectedLeagueId, "standings"],
    enabled: !!selectedLeagueId,
  });

  // Auto-select the league if there's only one available
  useEffect(() => {
    if (leagues && Array.isArray(leagues) && leagues.length === 1 && !selectedLeagueId) {
      setSelectedLeagueId(leagues[0].id);
    }
  }, [leagues, selectedLeagueId]);

  // Auto-select the team if there's only one available for the selected league
  useEffect(() => {
    if (teamsData?.teams && teamsData.teams.length === 1 && selectedLeagueId && !selectedTeam) {
      const firstTeam = teamsData.teams[0];
      const teamName = firstTeam.location && firstTeam.nickname 
        ? `${firstTeam.location} ${firstTeam.nickname}` 
        : `Team ${firstTeam.id}`;
      setSelectedTeam({
        teamId: firstTeam.id,
        teamName,
        leagueId: selectedLeagueId
      });
    }
  }, [teamsData, selectedLeagueId, selectedTeam, setSelectedTeam]);

  const handleGeneratePrompt = async () => {
    if (!selectedLeagueId || !selectedTeam) {
      toast({
        title: "Selection Required",
        description: "Please select a league and team first.",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    try {
      const response = await fetch(`/api/leagues/${selectedLeagueId}/custom-prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId: selectedTeam.teamId,
          customPrompt,
          options: {
            includeMyTeam,
            includeOtherTeams,
            selectedOtherTeams,
            includeWaiverWire,
            waiverWirePosition,
            waiverWireTeam,
            excludeIRPlayers,
            excludeOutPlayers,
            excludeDoubtfulPlayers,
            excludeQuestionablePlayers,
            includeLeagueSettings,
            // Context data options
            includeFantasyPros,
            includeVegasOdds,
            includeInjuryReports,
            includeWeatherData,
            includeNewsUpdates,
            includeMatchupAnalysis,
            // Player-level data options
            includePlayerNews,
            includePlayerProjections,
            includePlayerRankings
          }
        })
      });

      if (!response.ok) throw new Error('Failed to generate prompt');
      
      const result = await response.json();
      setGeneratedPrompt(result.prompt);
      
      toast({
        title: "Prompt Generated",
        description: "Your custom prompt has been generated successfully!",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to generate prompt",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(generatedPrompt);
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

  const positions = ["QB", "RB", "WR", "TE", "K", "DEF"];
  const nflTeams = [
    "ATL", "BUF", "CHI", "CIN", "CLE", "DAL", "DEN", "DET", "GB", "TEN", 
    "IND", "KC", "LV", "LAR", "MIA", "MIN", "NE", "NO", "NYG", "NYJ", 
    "PHI", "ARI", "PIT", "LAC", "SF", "SEA", "TB", "WAS", "CAR", "JAX", 
    "BAL", "HOU"
  ];

  return (
    <>
      {/* Header Bar */}
      <header className="bg-card border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <FileText className="h-6 w-6" />
              AI Prompt Builder
            </h2>
            <p className="text-muted-foreground">Build custom AI prompts with your fantasy data</p>
          </div>
          <div className="flex items-center space-x-3">
            <Select value={selectedLeagueId} onValueChange={setSelectedLeagueId}>
              <SelectTrigger className="w-48" data-testid="select-league">
                <SelectValue placeholder="Select a league" />
              </SelectTrigger>
              <SelectContent>
                {(leagues && Array.isArray(leagues) ? leagues : []).map((league: any) => (
                  <SelectItem key={league.id} value={league.id}>
                    {league.name} ({league.season})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            {selectedLeagueId && (
              <Select 
                value={selectedTeam?.teamId.toString() || ""} 
                onValueChange={(value) => {
                  const teamId = parseInt(value);
                  const team = teamsData?.teams?.find((t: any) => t.id === teamId);
                  if (team && selectedLeagueId) {
                    const teamName = team.location && team.nickname 
                      ? `${team.location} ${team.nickname}` 
                      : `Team ${team.id}`;
                    setSelectedTeam({
                      teamId,
                      teamName,
                      leagueId: selectedLeagueId
                    });
                    toast({
                      title: "Team Selected",
                      description: `You are now building prompts for "${teamName}"`,
                    });
                  }
                }}
                disabled={!selectedLeagueId || isLoadingTeams || !teamsData?.teams?.length}
              >
                <SelectTrigger className="w-48" data-testid="select-team">
                  <SelectValue placeholder={
                    !selectedLeagueId 
                      ? "Select a league first" 
                      : isLoadingTeams 
                        ? "Loading teams..." 
                        : !teamsData?.teams?.length 
                          ? "No teams found" 
                          : "Select your team"
                  } />
                </SelectTrigger>
                <SelectContent>
                  {teamsData?.teams?.map((team: any) => {
                    const teamName = team.location && team.nickname 
                      ? `${team.location} ${team.nickname}` 
                      : `Team ${team.id}`;
                    return (
                      <SelectItem key={team.id} value={team.id.toString()}>
                        {teamName}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 p-6 space-y-6 overflow-y-auto">
        {selectedLeagueId && selectedTeam && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Prompt Configuration */}
            <div className="space-y-6">
              {/* Custom Prompt Input */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Your Custom Prompt
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Textarea
                    placeholder="Enter your custom prompt or question here. The fantasy data you select below will be automatically included..."
                    value={customPrompt}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                    className="min-h-[120px]"
                  />
                </CardContent>
              </Card>

              {/* Data Inclusion Options */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="h-5 w-5" />
                    Include Data
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* My Team */}
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="include-my-team" 
                      checked={includeMyTeam}
                      onCheckedChange={(checked) => setIncludeMyTeam(checked as boolean)}
                    />
                    <label htmlFor="include-my-team" className="flex items-center gap-2 text-sm font-medium">
                      <User className="h-4 w-4" />
                      My Team Roster
                    </label>
                  </div>

                  <Separator />

                  {/* Other Teams */}
                  <div className="space-y-3">
                    <label className="flex items-center gap-2 text-sm font-medium">
                      <Users className="h-4 w-4" />
                      Other Teams
                    </label>
                    <Select value={includeOtherTeams} onValueChange={setIncludeOtherTeams}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Don't include</SelectItem>
                        <SelectItem value="all">All teams</SelectItem>
                        <SelectItem value="specific">Specific teams</SelectItem>
                      </SelectContent>
                    </Select>

                    {includeOtherTeams === "specific" && (
                      <div className="space-y-2">
                        <label className="text-xs text-muted-foreground">Select teams to include:</label>
                        <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto">
                          {teamsData?.teams?.filter((team: any) => team.id !== selectedTeam?.teamId).map((team: any) => {
                            const teamName = team.location && team.nickname 
                              ? `${team.location} ${team.nickname}` 
                              : `Team ${team.id}`;
                            return (
                              <div key={team.id} className="flex items-center space-x-2">
                                <Checkbox 
                                  id={`team-${team.id}`}
                                  checked={selectedOtherTeams.includes(team.id.toString())}
                                  onCheckedChange={(checked) => {
                                    if (checked) {
                                      setSelectedOtherTeams([...selectedOtherTeams, team.id.toString()]);
                                    } else {
                                      setSelectedOtherTeams(selectedOtherTeams.filter(id => id !== team.id.toString()));
                                    }
                                  }}
                                />
                                <label htmlFor={`team-${team.id}`} className="text-xs">{teamName}</label>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  <Separator />

                  {/* Waiver Wire */}
                  <div className="space-y-3">
                    <label className="flex items-center gap-2 text-sm font-medium">
                      <Search className="h-4 w-4" />
                      Waiver Wire Players
                    </label>
                    <Select value={includeWaiverWire} onValueChange={setIncludeWaiverWire}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Don't include</SelectItem>
                        <SelectItem value="top50">Top 50 available</SelectItem>
                        <SelectItem value="position">By position</SelectItem>
                        <SelectItem value="team">By NFL team</SelectItem>
                      </SelectContent>
                    </Select>

                    {includeWaiverWire === "position" && (
                      <Select value={waiverWirePosition} onValueChange={setWaiverWirePosition}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select position" />
                        </SelectTrigger>
                        <SelectContent>
                          {positions.map(pos => (
                            <SelectItem key={pos} value={pos}>{pos}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}

                    {includeWaiverWire === "team" && (
                      <Select value={waiverWireTeam} onValueChange={setWaiverWireTeam}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select NFL team" />
                        </SelectTrigger>
                        <SelectContent>
                          {nflTeams.map(team => (
                            <SelectItem key={team} value={team}>{team}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}

                    {includeWaiverWire !== "none" && (
                      <div className="space-y-2 pt-2">
                        <div className="flex items-center space-x-2">
                          <Checkbox 
                            id="exclude-ir-players" 
                            checked={excludeIRPlayers}
                            onCheckedChange={(checked) => setExcludeIRPlayers(checked as boolean)}
                          />
                          <label htmlFor="exclude-ir-players" className="text-sm">
                            Exclude IR Players
                          </label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox 
                            id="exclude-out-players" 
                            checked={excludeOutPlayers}
                            onCheckedChange={(checked) => setExcludeOutPlayers(checked as boolean)}
                          />
                          <label htmlFor="exclude-out-players" className="text-sm">
                            Exclude Out Players
                          </label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox 
                            id="exclude-doubtful-players" 
                            checked={excludeDoubtfulPlayers}
                            onCheckedChange={(checked) => setExcludeDoubtfulPlayers(checked as boolean)}
                          />
                          <label htmlFor="exclude-doubtful-players" className="text-sm">
                            Exclude Doubtful Players
                          </label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox 
                            id="exclude-questionable-players" 
                            checked={excludeQuestionablePlayers}
                            onCheckedChange={(checked) => setExcludeQuestionablePlayers(checked as boolean)}
                          />
                          <label htmlFor="exclude-questionable-players" className="text-sm">
                            Exclude Questionable Players
                          </label>
                        </div>
                      </div>
                    )}
                  </div>

                  <Separator />

                  {/* League Settings */}
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="include-league-settings" 
                      checked={includeLeagueSettings}
                      onCheckedChange={(checked) => setIncludeLeagueSettings(checked as boolean)}
                    />
                    <label htmlFor="include-league-settings" className="flex items-center gap-2 text-sm font-medium">
                      <Crown className="h-4 w-4" />
                      League Settings & Scoring
                    </label>
                  </div>

                  <Separator />

                  {/* Context Data Options */}
                  <div className="space-y-3">
                    <label className="flex items-center gap-2 text-sm font-medium">
                      <Globe className="h-4 w-4" />
                      External Research Data
                    </label>
                    <p className="text-xs text-muted-foreground">
                      Include external data sources to help the AI make more informed recommendations
                    </p>
                    
                    <div className="grid grid-cols-1 gap-2">
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="include-fantasypros" 
                          checked={includeFantasyPros}
                          onCheckedChange={(checked) => setIncludeFantasyPros(checked as boolean)}
                        />
                        <label htmlFor="include-fantasypros" className="text-sm">
                          FantasyPros Rankings & Expert Consensus
                        </label>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="include-vegas-odds" 
                          checked={includeVegasOdds}
                          onCheckedChange={(checked) => setIncludeVegasOdds(checked as boolean)}
                        />
                        <label htmlFor="include-vegas-odds" className="text-sm">
                          Vegas Betting Lines & Player Props
                        </label>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="include-injury-reports" 
                          checked={includeInjuryReports}
                          onCheckedChange={(checked) => setIncludeInjuryReports(checked as boolean)}
                        />
                        <label htmlFor="include-injury-reports" className="text-sm">
                          Injury Reports & Player Status
                        </label>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="include-weather-data" 
                          checked={includeWeatherData}
                          onCheckedChange={(checked) => setIncludeWeatherData(checked as boolean)}
                        />
                        <label htmlFor="include-weather-data" className="text-sm">
                          Weather Conditions & Forecasts
                        </label>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="include-news-updates" 
                          checked={includeNewsUpdates}
                          onCheckedChange={(checked) => setIncludeNewsUpdates(checked as boolean)}
                        />
                        <label htmlFor="include-news-updates" className="text-sm">
                          Latest News & Beat Reporter Updates
                        </label>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="include-matchup-analysis" 
                          checked={includeMatchupAnalysis}
                          onCheckedChange={(checked) => setIncludeMatchupAnalysis(checked as boolean)}
                        />
                        <label htmlFor="include-matchup-analysis" className="text-sm">
                          Defensive Matchup Analysis & Target Data
                        </label>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Player-Level Data Options */}
                  <div className="space-y-3">
                    <label className="flex items-center gap-2 text-sm font-medium">
                      <Users className="h-4 w-4" />
                      Player-Level Data
                    </label>
                    <p className="text-xs text-muted-foreground">
                      Include detailed player data from FantasyPros database for players in your prompt
                    </p>
                    
                    <div className="grid grid-cols-1 gap-2">
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="include-player-news" 
                          checked={includePlayerNews}
                          onCheckedChange={(checked) => setIncludePlayerNews(checked as boolean)}
                        />
                        <label htmlFor="include-player-news" className="text-sm">
                          Player News & Updates
                        </label>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="include-player-projections" 
                          checked={includePlayerProjections}
                          onCheckedChange={(checked) => setIncludePlayerProjections(checked as boolean)}
                        />
                        <label htmlFor="include-player-projections" className="text-sm">
                          Player Projections
                        </label>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="include-player-rankings" 
                          checked={includePlayerRankings}
                          onCheckedChange={(checked) => setIncludePlayerRankings(checked as boolean)}
                        />
                        <label htmlFor="include-player-rankings" className="text-sm">
                          Expert Consensus Rankings
                        </label>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Generate Button */}
              <Button 
                onClick={handleGeneratePrompt}
                disabled={isGenerating || !customPrompt.trim()}
                className="w-full"
                size="lg"
              >
                {isGenerating ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Globe className="h-4 w-4 mr-2" />
                )}
                Generate Custom Prompt
              </Button>
            </div>

            {/* Generated Prompt Display */}
            <div className="space-y-6">
              {generatedPrompt && (
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2">
                        <FileText className="h-5 w-5" />
                        Generated Prompt
                      </CardTitle>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={copyToClipboard}
                        className="flex items-center gap-2"
                      >
                        {copied ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                        {copied ? "Copied!" : "Copy"}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="bg-muted p-4 rounded-lg">
                      <pre className="whitespace-pre-wrap text-sm font-mono">
                        {generatedPrompt}
                      </pre>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Instructions */}
              <Card>
                <CardHeader>
                  <CardTitle>How to Use</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  <div className="flex items-start gap-3">
                    <Badge variant="outline" className="mt-0.5">1</Badge>
                    <p>Write your custom prompt or question in the text area</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <Badge variant="outline" className="mt-0.5">2</Badge>
                    <p>Select which fantasy data to include with your prompt</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <Badge variant="outline" className="mt-0.5">3</Badge>
                    <p>Click "Generate Custom Prompt" to build your AI prompt</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <Badge variant="outline" className="mt-0.5">4</Badge>
                    <p>Copy the generated prompt and paste it into your AI portal (ChatGPT, Claude, etc.)</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {(!selectedLeagueId || !selectedTeam) && (
          <Card>
            <CardContent className="flex items-center justify-center h-96">
              <div className="text-center">
                <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">
                  Please select a league and team to start building custom AI prompts
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </>
  );
}