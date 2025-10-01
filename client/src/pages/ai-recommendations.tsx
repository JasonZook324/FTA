import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Brain, Lightbulb, TrendingUp, Users, MessageSquare, Loader2, Copy, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTeam } from "@/contexts/TeamContext";

interface FantasyRecommendation {
  type: 'waiver_wire' | 'trade' | 'lineup' | 'general';
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  reasoning: string;
}

interface FantasyAnalysis {
  recommendations: FantasyRecommendation[];
  summary: string;
  strengths: string[];
  weaknesses: string[];
}

export default function AIRecommendations() {
  const { toast } = useToast();
  const { selectedTeam, setSelectedTeam } = useTeam();
  const [userId] = useState("default-user");
  const [selectedLeagueId, setSelectedLeagueId] = useState<string>("");
  const [question, setQuestion] = useState("");
  const [copiedAnalysis, setCopiedAnalysis] = useState(false);
  const [copiedQuestion, setCopiedQuestion] = useState(false);

  // Query user leagues
  const { data: leagues } = useQuery({
    queryKey: ["/api/leagues", userId],
  });

  // Query teams for selected league (use standings endpoint to get properly formatted team names)
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

  // AI Analysis mutation - now returns prompt instead of calling AI
  const analysisMutation = useMutation({
    mutationFn: async (leagueId: string) => {
      if (!selectedTeam) {
        throw new Error('Please select a team first');
      }
      const response = await fetch(`/api/leagues/${leagueId}/ai-recommendations-prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId: selectedTeam.teamId })
      });
      if (!response.ok) throw new Error('Failed to generate prompt');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai-analysis"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  // AI Question mutation - now returns prompt instead of calling AI
  const questionMutation = useMutation({
    mutationFn: async ({ leagueId, question }: { leagueId: string; question: string }) => {
      if (!selectedTeam) {
        throw new Error('Please select a team first');
      }
      const response = await fetch(`/api/leagues/${leagueId}/ai-question-prompt`, {
        method: 'POST',
        body: JSON.stringify({ question, teamId: selectedTeam.teamId }),
        headers: { 'Content-Type': 'application/json' }
      });
      if (!response.ok) throw new Error('Failed to generate prompt');
      return response.json();
    }
  });

  const handleAnalyze = () => {
    if (selectedLeagueId) {
      analysisMutation.mutate(selectedLeagueId);
    }
  };

  const handleAskQuestion = () => {
    if (selectedLeagueId && question.trim()) {
      questionMutation.mutate({ leagueId: selectedLeagueId, question });
    }
  };

  const copyToClipboard = async (text: string, type: 'analysis' | 'question') => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'analysis') {
        setCopiedAnalysis(true);
        setTimeout(() => setCopiedAnalysis(false), 2000);
      } else {
        setCopiedQuestion(true);
        setTimeout(() => setCopiedQuestion(false), 2000);
      }
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

  const analysisPrompt = analysisMutation.data as { prompt: string } | undefined;
  const questionPrompt = questionMutation.data as { prompt: string } | undefined;

  return (
    <>
      {/* Header Bar */}
      <header className="bg-card border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Brain className="h-6 w-6" />
              AI Recommendations
            </h2>
            <p className="text-muted-foreground">Get AI-powered insights and strategic advice for your fantasy league</p>
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
                      description: `You are now analyzing "${teamName}"`,
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
            
            {selectedLeagueId && selectedTeam && (
              <Button 
                onClick={handleAnalyze}
                disabled={analysisMutation.isPending}
                data-testid="button-analyze"
              >
                {analysisMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Brain className="h-4 w-4 mr-2" />
                )}
                Generate Analysis Prompt
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 p-6 space-y-6 overflow-y-auto">
        {/* AI Question Section */}
        {selectedLeagueId && selectedTeam && (
          <Card data-testid="ai-question-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Ask AI Assistant
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                placeholder="Ask any question about your league strategy, players, or fantasy football in general..."
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                className="min-h-[100px]"
                data-testid="textarea-question"
              />
              <Button 
                onClick={handleAskQuestion}
                disabled={questionMutation.isPending || !question.trim()}
                data-testid="button-ask-question"
              >
                {questionMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <MessageSquare className="h-4 w-4 mr-2" />
                )}
                Generate Question Prompt
              </Button>
              
              {questionPrompt && (
                <div className="mt-4" data-testid="ai-question-prompt">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-semibold">AI Prompt Generated</h4>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copyToClipboard(questionPrompt.prompt, 'question')}
                      data-testid="button-copy-question"
                    >
                      {copiedQuestion ? (
                        <><Check className="h-4 w-4 mr-2" /> Copied</>
                      ) : (
                        <><Copy className="h-4 w-4 mr-2" /> Copy Prompt</>
                      )}
                    </Button>
                  </div>
                  <div className="p-4 bg-muted rounded-lg border border-border max-h-96 overflow-y-auto">
                    <pre className="text-sm whitespace-pre-wrap font-mono">{questionPrompt.prompt}</pre>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Copy this prompt and paste it into ChatGPT, Claude, or your preferred AI assistant to get your answer.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Analysis Results */}
        {analysisPrompt && (
          <Card data-testid="analysis-prompt-card">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>League Analysis Prompt</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => copyToClipboard(analysisPrompt.prompt, 'analysis')}
                  data-testid="button-copy-analysis"
                >
                  {copiedAnalysis ? (
                    <><Check className="h-4 w-4 mr-2" /> Copied</>
                  ) : (
                    <><Copy className="h-4 w-4 mr-2" /> Copy Prompt</>
                  )}
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="p-4 bg-muted rounded-lg border border-border max-h-96 overflow-y-auto">
                <pre className="text-sm whitespace-pre-wrap font-mono">{analysisPrompt.prompt}</pre>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Copy this prompt and paste it into ChatGPT, Claude, or your preferred AI assistant. The AI will respond with HTML-formatted recommendations based on your team's data.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Error States */}
        {analysisMutation.isError && (
          <Card data-testid="analysis-error">
            <CardContent className="pt-6">
              <p className="text-red-600 text-center">
                Error analyzing league: {analysisMutation.error?.message || 'Unknown error'}
              </p>
            </CardContent>
          </Card>
        )}

        {questionMutation.isError && (
          <Card data-testid="question-error">
            <CardContent className="pt-6">
              <p className="text-red-600 text-center">
                Error asking question: {questionMutation.error?.message || 'Unknown error'}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Empty State */}
        {!selectedLeagueId && (
          <Card data-testid="empty-state">
            <CardContent className="pt-6">
              <div className="text-center py-8">
                <Brain className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">Get AI-Powered Fantasy Insights</h3>
                <p className="text-muted-foreground mb-4">
                  Select a league above to get personalized recommendations and strategic advice powered by AI.
                </p>
                <div className="text-sm text-muted-foreground space-y-1">
                  <p>• Waiver wire pickup suggestions</p>
                  <p>• Trade opportunity analysis</p>
                  <p>• Lineup optimization tips</p>
                  <p>• Custom strategy questions</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </>
  );
}