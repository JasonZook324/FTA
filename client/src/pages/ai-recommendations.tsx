import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Brain, Lightbulb, TrendingUp, Users, MessageSquare, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useSelectedLeague } from "@/hooks/useSelectedLeague";

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
  const [userId] = useState("default-user");
  const [question, setQuestion] = useState("");

  const { selectedLeagueId, leagues } = useSelectedLeague(userId);
  const selectedLeague = leagues.find((l: any) => l.id === selectedLeagueId);

  // Fetch waiver wire data for the current league
  const { data: waiverWireData, isLoading: waiverWireLoading } = useQuery({
    queryKey: ["/api/leagues", selectedLeagueId, "waiver-wire"],
    enabled: !!selectedLeagueId,
    staleTime: 5 * 60 * 1000 // 5 minutes
  });

  // AI Analysis mutation
  const analysisMutation = useMutation({
    mutationFn: async (leagueId: string) => {
      const response = await fetch(`/api/leagues/${leagueId}/ai-recommendations`, {
        method: 'POST'
      });
      if (!response.ok) throw new Error('Failed to analyze league');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai-analysis"] });
    }
  });

  // AI Question mutation now includes waiver wire data
  const questionMutation = useMutation({
    mutationFn: async ({ leagueId, question, waiverWire }: { leagueId: string; question: string; waiverWire: any }) => {
      const response = await fetch(`/api/leagues/${leagueId}/ai-question`, {
        method: 'POST',
        body: JSON.stringify({ question, waiverWire }),
        headers: { 'Content-Type': 'application/json' }
      });
      if (!response.ok) throw new Error('Failed to ask question');
      return response.json();
    }
  });

  // Automatically trigger analysis when league is loaded
  useEffect(() => {
    if (selectedLeagueId && selectedLeague && !analysisMutation.data && !analysisMutation.isPending) {
      analysisMutation.mutate(selectedLeagueId);
    }
  }, [selectedLeagueId, selectedLeague]);

  const handleAnalyze = () => {
    if (selectedLeagueId) {
      analysisMutation.mutate(selectedLeagueId);
    }
  };

  const handleAskQuestion = () => {
    if (selectedLeagueId && question.trim()) {
      questionMutation.mutate({
        leagueId: selectedLeagueId,
        question,
        waiverWire: waiverWireData || []
      });
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'waiver_wire': return <Users className="h-4 w-4" />;
      case 'trade': return <TrendingUp className="h-4 w-4" />;
      case 'lineup': return <Lightbulb className="h-4 w-4" />;
      default: return <Brain className="h-4 w-4" />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-500 text-white';
      case 'medium': return 'bg-yellow-500 text-black';
      case 'low': return 'bg-green-500 text-white';
      default: return 'bg-gray-500 text-white';
    }
  };

  const analysisData = analysisMutation.data as FantasyAnalysis | undefined;
  const questionAnswer = questionMutation.data as { answer: string } | undefined;

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
        </div>
      </header>

      <main className="flex-1 p-6 space-y-6 overflow-y-auto">
        {/* Visual feedback while analysis is pending */}
        {analysisMutation.isPending && (
          <Card data-testid="analysis-loading">
            <CardContent className="flex flex-col items-center py-8">
              <Loader2 className="h-10 w-10 animate-spin text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Analyzing your league...</h3>
              <p className="text-muted-foreground text-center">
                Please wait while the AI reviews your league data and prepares recommendations.
              </p>
            </CardContent>
          </Card>
        )}

        {/* AI Question Section */}
        {selectedLeagueId && (
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
                Ask Question
              </Button>
              
              {questionAnswer && (
                <div className="mt-4 p-4 bg-muted rounded-lg" data-testid="ai-answer">
                  <h4 className="font-semibold mb-2">AI Response:</h4>
                  <div className="max-h-80 overflow-y-auto">
                    <p className="text-sm whitespace-pre-wrap">{questionAnswer.answer}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Analysis Results */}
        {analysisData && (
          <div className="space-y-6">
            {/* Summary */}
            <Card data-testid="analysis-summary">
              <CardHeader>
                <CardTitle>League Analysis Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-h-40 overflow-y-auto">
                  <p className="text-sm">{analysisData.summary}</p>
                </div>
              </CardContent>
            </Card>

            {/* Strengths & Weaknesses */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card data-testid="strengths-card">
                <CardHeader>
                  <CardTitle className="text-green-600">Strengths</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="max-h-60 overflow-y-auto">
                    <ul className="space-y-2">
                      {analysisData.strengths.map((strength, index) => (
                        <li key={index} className="text-sm flex items-start gap-2">
                          <span className="text-green-500 mt-1">•</span>
                          {strength}
                        </li>
                      ))}
                    </ul>
                  </div>
                </CardContent>
              </Card>

              <Card data-testid="weaknesses-card">
                <CardHeader>
                  <CardTitle className="text-red-600">Areas for Improvement</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="max-h-60 overflow-y-auto">
                    <ul className="space-y-2">
                      {analysisData.weaknesses.map((weakness, index) => (
                        <li key={index} className="text-sm flex items-start gap-2">
                          <span className="text-red-500 mt-1">•</span>
                          {weakness}
                        </li>
                      ))}
                    </ul>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Recommendations */}
            <Card data-testid="recommendations-card">
              <CardHeader>
                <CardTitle>Strategic Recommendations</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-h-96 overflow-y-auto">
                  <div className="space-y-4">
                    {analysisData.recommendations.map((rec, index) => (
                      <div key={index} className="border border-border rounded-lg p-4" data-testid={`recommendation-${index}`}>
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {getTypeIcon(rec.type)}
                            <h4 className="font-semibold">{rec.title}</h4>
                          </div>
                          <Badge className={getPriorityColor(rec.priority)}>
                            {rec.priority}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">{rec.description}</p>
                        <div className="text-xs text-muted-foreground bg-muted p-2 rounded">
                          <strong>Reasoning:</strong> {rec.reasoning}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
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
                  Loading your league data...
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