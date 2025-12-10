import { useState } from "react";
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
  Globe,
  Brain,
  Eye,
  EyeOff,
  AlertCircle
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTeam } from "@/contexts/TeamContext";

export default function PromptBuilder() {
  const { toast } = useToast();
  const { selectedTeam } = useTeam();
  const [customPrompt, setCustomPrompt] = useState("");
  const [copied, setCopied] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const [showPrompt, setShowPrompt] = useState(false);

  // AI submission state
  const [isSubmittingToAI, setIsSubmittingToAI] = useState(false);
  const [aiResponse, setAiResponse] = useState<{
    responseId: string;
    responseText: string;
    tokensUsed: number;
    model: string;
    responseTime: number;
  } | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  // Use a widely available default and still allow overriding
  const [selectedModel, setSelectedModel] = useState("gpt-4o-mini");

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

  // External research data - single toggle for all external data sources
  const [includeExternalResearch, setIncludeExternalResearch] = useState(false);

  // Player-level data options
  const [includePlayerNews, setIncludePlayerNews] = useState(false);
  const [includePlayerProjections, setIncludePlayerProjections] = useState(false);
  const [includePlayerRankings, setIncludePlayerRankings] = useState(false);
  const [includePlayerLevelData, setIncludePlayerLevelData] = useState(false);

  // Query teams for the selected team's league (needed for selecting other teams)
  const { data: teamsData } = useQuery<{ teams?: any[]; members?: any[] }>({
    queryKey: ["/api/leagues", selectedTeam?.leagueId, "standings"],
    enabled: !!selectedTeam?.leagueId,
  });

  const handleGeneratePrompt = async () => {
    if (!selectedTeam) {
      toast({
        title: "Selection Required",
        description: "Please select a team from the header first.",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    try {
      const response = await fetch(`/api/leagues/${selectedTeam.leagueId}/custom-prompt`, {
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
            // External research data - single option enables all sources
            includeFantasyPros: includeExternalResearch,
            includeVegasOdds: includeExternalResearch,
            includeInjuryReports: includeExternalResearch,
            includeWeatherData: includeExternalResearch,
            includeNewsUpdates: includeExternalResearch,
            includeMatchupAnalysis: includeExternalResearch,
            // Player-level data options
            includePlayerNews,
            includePlayerProjections,
            includePlayerRankings,
            includePlayerLevelData
          }
        })
      });

      if (!response.ok) throw new Error('Failed to generate prompt');
      
      const result = await response.json();
      setGeneratedPrompt(result.prompt);
  setShowPrompt(false); // hide by default to save space
      
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

  const handleSubmitToAI = async () => {
    if (!selectedTeam) {
      toast({
        title: "Selection Required",
        description: "Please select a team from the header first.",
        variant: "destructive",
      });
      return;
    }

    if (!generatedPrompt || generatedPrompt.trim().length === 0) {
      toast({
        title: "No Prompt",
        description: "Generate a prompt first before submitting to AI.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmittingToAI(true);
    setAiError(null);
    setAiResponse(null);

    try {
      const response = await fetch(`/api/leagues/${selectedTeam.leagueId}/submit-ai-prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId: selectedTeam.teamId,
          promptText: generatedPrompt,
          model: selectedModel,
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to get AI response');
      }
      
      const result = await response.json();
      setAiResponse(result);
      
      toast({
        title: "AI Analysis Complete",
        description: `Received response from ${result.model} (${result.tokensUsed} tokens)`,
      });
    } catch (error: any) {
      setAiError(error.message);
      toast({
        title: "AI Submission Failed",
        description: error.message || "Failed to get AI response",
        variant: "destructive",
      });
    } finally {
      setIsSubmittingToAI(false);
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
        </div>
      </header>

      <main className="flex-1 p-6 space-y-6 overflow-y-auto">
        {selectedTeam && (
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
                    data-testid="input-prompt"
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
                      data-testid="checkbox-my-team"
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
                            // Comprehensive team name fallback logic
                            const getTeamName = (team: any) => {
                              if (team.location && team.nickname) {
                                return `${team.location} ${team.nickname}`;
                              }
                              if (team.location) return team.location;
                              if (team.nickname) return team.nickname;
                              if (team.name) return team.name;
                              // Try to get owner's team name from members
                              if (team.owners && teamsData.members) {
                                const ownerId = team.owners[0]?.id || team.owners[0];
                                const member = teamsData.members.find((m: any) => m.id === ownerId);
                                if (member) {
                                  if (member.firstName && member.lastName) {
                                    return `${member.firstName} ${member.lastName}'s Team`;
                                  }
                                  if (member.displayName) {
                                    return `${member.displayName}'s Team`;
                                  }
                                }
                              }
                              return `Team ${team.id}`;
                            };
                            const teamName = getTeamName(team);
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
                        <SelectItem value="top20">Top 20 available</SelectItem>
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

                  {/* External Research Data - Single Checkbox */}
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="include-external-research" 
                      data-testid="checkbox-external-research"
                      checked={includeExternalResearch}
                      onCheckedChange={(checked) => setIncludeExternalResearch(checked as boolean)}
                    />
                    <label htmlFor="include-external-research" className="flex items-center gap-2 text-sm font-medium">
                      <Globe className="h-4 w-4" />
                      Include All External Research Data
                    </label>
                  </div>
                  <p className="text-xs text-muted-foreground ml-6">
                    Enables: FantasyPros rankings, Vegas betting lines, injury reports, weather data, latest news updates, and matchup analysis
                  </p>

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
                          id="include-player-level-data" 
                          data-testid="checkbox-player-level-data"
                          checked={includePlayerLevelData}
                          onCheckedChange={(checked) => setIncludePlayerLevelData(checked as boolean)}
                        />
                        <label htmlFor="include-player-level-data" className="text-sm font-medium">
                          Include Comprehensive Player Data
                        </label>
                      </div>
                      <p className="text-xs text-muted-foreground ml-6">
                        Adds rank, injury status, projected points, ESPN outlook, FP headlines/analysis, and opponent data for every player
                      </p>
                      
                      <Separator className="my-2" />
                      
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="include-player-news" 
                          data-testid="checkbox-player-news"
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
                          data-testid="checkbox-player-projections"
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
                          data-testid="checkbox-player-rankings"
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
                data-testid="button-generate-prompt"
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
                        variant="ghost"
                        onClick={() => setShowPrompt(!showPrompt)}
                        className="flex items-center gap-2"
                        data-testid="button-toggle-prompt-visibility"
                      >
                        {showPrompt ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        {showPrompt ? "Hide prompt" : "Show prompt"}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {showPrompt ? (
                      <div className="space-y-3">
                        <div className="flex justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={copyToClipboard}
                            className="flex items-center gap-2"
                            data-testid="button-copy-prompt"
                          >
                            {copied ? (
                              <Check className="h-4 w-4" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                            {copied ? "Copied!" : "Copy"}
                          </Button>
                        </div>
                        <div className="bg-muted p-4 rounded-lg">
                          <pre className="whitespace-pre-wrap text-sm font-mono">
                            {generatedPrompt}
                          </pre>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground" data-testid="text-prompt-hidden">
                        Prompt hidden to save space. Click "Show prompt" if you want to review or copy it.
                      </p>
                    )}

                    {/* AI Model Selection and Submit Button */}
                    <div className="mt-4 space-y-4">
                      <div className="flex items-center gap-4">
                        <label htmlFor="ai-model" className="text-sm font-medium">AI Model:</label>
                        <Select value={selectedModel} onValueChange={setSelectedModel}>
                          <SelectTrigger className="w-[200px]" id="ai-model" data-testid="select-ai-model">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="gpt-4o" data-testid="option-gpt-4o">GPT-4o</SelectItem>
                            <SelectItem value="gpt-4o-mini" data-testid="option-gpt-4o-mini">GPT-4o mini</SelectItem>
                            <SelectItem value="gpt-4" data-testid="option-gpt-4">GPT-4 (legacy)</SelectItem>
                            <SelectItem value="gpt-4-turbo" data-testid="option-gpt-4-turbo">GPT-4 Turbo (legacy)</SelectItem>
                            <SelectItem value="gpt-3.5-turbo" data-testid="option-gpt-3.5-turbo">GPT-3.5 Turbo (legacy)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <Button
                        onClick={handleSubmitToAI}
                        disabled={isSubmittingToAI || !generatedPrompt}
                        className="w-full"
                        data-testid="button-submit-ai"
                      >
                        {isSubmittingToAI ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Analyzing with AI...
                          </>
                        ) : (
                          <>
                            <Brain className="mr-2 h-4 w-4" />
                            Get AI Analysis
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* AI Response Display */}
              {aiResponse && (
                <Card data-testid="card-ai-response">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Brain className="h-5 w-5 text-purple-600" />
                      AI Analysis
                      <Badge variant="outline" className="ml-auto">
                        {aiResponse.model}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="prose prose-sm max-w-none dark:prose-invert">
                      <div 
                        className="whitespace-pre-wrap bg-muted p-4 rounded-lg"
                        data-testid="text-ai-response"
                      >
                        {aiResponse.responseText}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 mt-4 text-sm text-muted-foreground">
                      <span>Tokens: {aiResponse.tokensUsed}</span>
                      <span>•</span>
                      <span>Response Time: {(aiResponse.responseTime / 1000).toFixed(2)}s</span>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Error Display */}
              {aiError && (
                <Card className="border-destructive" data-testid="card-ai-error">
                  <CardContent className="pt-6">
                    <div className="flex items-start gap-2 text-destructive">
                      <AlertCircle className="h-5 w-5 mt-0.5" />
                      <div>
                        <p className="font-semibold">AI Submission Failed</p>
                        <p className="text-sm">{aiError}</p>
                      </div>
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
                    <p>Click "Get AI Analysis" to submit to OpenAI directly, or copy and paste into your AI portal</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {!selectedTeam && (
          <Card>
            <CardContent className="flex items-center justify-center h-96">
              <div className="text-center">
                <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">
                  Please select a team from the header to start building custom AI prompts
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </>
  );
}