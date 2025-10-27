import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CloudSun, TrendingUp, Target, Shield, Trophy, Home, Plane } from "lucide-react";

interface KickerRecommendation {
  playerName: string;
  nflTeam: string;
  nflTeamAbbr: string;
  opponent: string;
  isHome: boolean;
  totalScore: number;
  breakdown: {
    domeAdvantage: number;
    vegasScore: number;
    redZoneScore: number;
    oppDefenseScore: number;
  };
  factors: {
    inDome: boolean;
    roofType: string | null;
    isUnderdog: boolean;
    spread: string | null;
    overUnder: string | null;
    teamRedZoneTdRate: string | null;
    oppRedZoneTdRate: string | null;
  };
  projection: number;
}

export default function Streaming() {
  const { user } = useAuth();
  const [selectedWeek, setSelectedWeek] = useState("1");
  const currentSeason = 2025;

  const { data: kickerData, isLoading } = useQuery<{ recommendations: KickerRecommendation[] }>({
    queryKey: ["/api/kicker-streaming", currentSeason, selectedWeek],
    queryFn: async () => {
      const response = await fetch(`/api/kicker-streaming?season=${currentSeason}&week=${selectedWeek}`);
      if (!response.ok) {
        throw new Error('Failed to fetch kicker recommendations');
      }
      return response.json();
    },
    enabled: !!user,
  });

  const recommendations = kickerData?.recommendations || [];

  return (
    <div className="container mx-auto p-4 md:p-8 max-w-7xl">
      {/* Header Section */}
      <div className="mb-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
          <div>
            <h1 className="text-4xl md:text-5xl font-bold mb-2" data-testid="text-page-title">
              Kicker Streaming
            </h1>
            <p className="text-muted-foreground text-lg">
              Find the best kicker matchups based on stadium conditions, Vegas odds, and red zone efficiency
            </p>
          </div>
          
          <div className="flex items-center gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Week</label>
              <Select value={selectedWeek} onValueChange={setSelectedWeek}>
                <SelectTrigger className="w-[120px]" data-testid="select-week">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 18 }, (_, i) => i + 1).map((week) => (
                    <SelectItem key={week} value={week.toString()}>
                      Week {week}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Quick Stats Banner */}
        {!isLoading && recommendations.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <CloudSun className="w-5 h-5 text-blue-500" />
                  <div>
                    <div className="text-2xl font-bold font-mono" data-testid="text-dome-count">
                      {recommendations.filter(r => r.factors.inDome).length}
                    </div>
                    <div className="text-xs text-muted-foreground">Dome Games</div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-green-500" />
                  <div>
                    <div className="text-2xl font-bold font-mono" data-testid="text-high-total-count">
                      {recommendations.filter(r => parseFloat(r.factors.overUnder || "0") >= 47).length}
                    </div>
                    <div className="text-xs text-muted-foreground">High O/U (47+)</div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-yellow-500" />
                  <div>
                    <div className="text-2xl font-bold font-mono" data-testid="text-top-score">
                      {recommendations.length > 0 ? recommendations[0].totalScore : 0}
                    </div>
                    <div className="text-xs text-muted-foreground">Top Score</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <Skeleton className="w-16 h-16 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-6 w-48" />
                    <Skeleton className="h-4 w-64" />
                  </div>
                  <Skeleton className="h-10 w-24" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Rankings List */}
      {!isLoading && recommendations.length > 0 && (
        <div className="space-y-4">
          {recommendations.map((rec, index) => (
            <Card 
              key={`${rec.nflTeam}-${index}`}
              className="hover:shadow-lg transition-shadow"
              data-testid={`card-kicker-${index}`}
            >
              <CardContent className="p-6">
                <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
                  {/* Rank */}
                  <div className="flex-shrink-0">
                    <div 
                      className="w-16 h-16 rounded-lg bg-primary/10 flex items-center justify-center"
                      data-testid={`text-rank-${index}`}
                    >
                      <span className="text-3xl font-bold font-mono text-primary">
                        {index + 1}
                      </span>
                    </div>
                  </div>

                  {/* Player Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-xl font-bold" data-testid={`text-team-${index}`}>
                        {rec.nflTeam} Kicker
                      </h3>
                      {rec.isHome ? (
                        <span title="Home Game">
                          <Home className="w-4 h-4 text-green-600" />
                        </span>
                      ) : (
                        <span title="Away Game">
                          <Plane className="w-4 h-4 text-orange-600" />
                        </span>
                      )}
                    </div>
                    
                    <div className="text-sm text-muted-foreground mb-3" data-testid={`text-matchup-${index}`}>
                      {rec.isHome ? "vs" : "@"} {rec.opponent}
                    </div>

                    {/* Badges */}
                    <div className="flex flex-wrap gap-2 mb-3">
                      {rec.factors.inDome && (
                        <Badge variant="secondary" className="gap-1" data-testid={`badge-dome-${index}`}>
                          <CloudSun className="w-3 h-3" />
                          {rec.factors.roofType === 'dome' ? 'Dome' : 'Retractable'}
                        </Badge>
                      )}
                      {rec.factors.isUnderdog && (
                        <Badge variant="secondary" className="gap-1" data-testid={`badge-underdog-${index}`}>
                          <TrendingUp className="w-3 h-3" />
                          Underdog
                        </Badge>
                      )}
                      {parseFloat(rec.factors.overUnder || "0") >= 47 && (
                        <Badge variant="secondary" className="gap-1" data-testid={`badge-high-total-${index}`}>
                          <Target className="w-3 h-3" />
                          High O/U: {rec.factors.overUnder}
                        </Badge>
                      )}
                      {rec.factors.teamRedZoneTdRate && parseFloat(rec.factors.teamRedZoneTdRate) < 55 && (
                        <Badge variant="secondary" className="gap-1" data-testid={`badge-rz-stall-${index}`}>
                          <Shield className="w-3 h-3" />
                          RZ Stalls ({rec.factors.teamRedZoneTdRate}% TD)
                        </Badge>
                      )}
                    </div>

                    {/* Score Breakdown */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                      <div className="p-2 bg-muted rounded">
                        <div className="font-medium text-muted-foreground">Dome</div>
                        <div className="font-bold font-mono" data-testid={`score-dome-${index}`}>
                          {rec.breakdown.domeAdvantage}
                        </div>
                      </div>
                      <div className="p-2 bg-muted rounded">
                        <div className="font-medium text-muted-foreground">Vegas</div>
                        <div className="font-bold font-mono" data-testid={`score-vegas-${index}`}>
                          {rec.breakdown.vegasScore}
                        </div>
                      </div>
                      <div className="p-2 bg-muted rounded">
                        <div className="font-medium text-muted-foreground">Red Zone</div>
                        <div className="font-bold font-mono" data-testid={`score-redzone-${index}`}>
                          {rec.breakdown.redZoneScore}
                        </div>
                      </div>
                      <div className="p-2 bg-muted rounded">
                        <div className="font-medium text-muted-foreground">Opp Def</div>
                        <div className="font-bold font-mono" data-testid={`score-oppdef-${index}`}>
                          {rec.breakdown.oppDefenseScore}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Score & Projection */}
                  <div className="flex md:flex-col gap-4 md:gap-2 items-center md:items-end flex-shrink-0">
                    <div className="text-center">
                      <div className="text-xs font-medium text-muted-foreground mb-1">Total Score</div>
                      <div 
                        className="text-4xl font-bold font-mono text-primary"
                        data-testid={`text-total-score-${index}`}
                      >
                        {rec.totalScore}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs font-medium text-muted-foreground mb-1">Projection</div>
                      <div 
                        className="text-2xl font-bold font-mono"
                        data-testid={`text-projection-${index}`}
                      >
                        {rec.projection} pts
                      </div>
                    </div>
                    <Button 
                      variant="default" 
                      size="sm"
                      className="mt-2"
                      data-testid={`button-add-kicker-${index}`}
                      onClick={() => {
                        // Open ESPN Fantasy in new tab
                        window.open('https://fantasy.espn.com', '_blank');
                      }}
                    >
                      Find in ESPN
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && recommendations.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <Target className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-xl font-bold mb-2">No Data Available</h3>
            <p className="text-muted-foreground">
              Kicker recommendations for Week {selectedWeek} are not yet available. 
              Please run the data refresh jobs first.
            </p>
          </CardContent>
        </Card>
      )}

      {/* How to Use Section */}
      <Card className="mt-8 border-2 border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="w-5 h-5" />
            How to Use These Recommendations
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="bg-primary/5 p-4 rounded-lg">
            <h4 className="font-semibold mb-2">Step 1: Review Rankings</h4>
            <p className="text-sm text-muted-foreground">
              Kickers are ranked by total score. Higher scores indicate better matchup conditions for field goal opportunities.
            </p>
          </div>
          <div className="bg-primary/5 p-4 rounded-lg">
            <h4 className="font-semibold mb-2">Step 2: Check Availability</h4>
            <p className="text-sm text-muted-foreground">
              Click "Find in ESPN" to open ESPN Fantasy. Search for the team's kicker (e.g., search "{recommendations.length > 0 ? recommendations[0].nflTeam : 'team name'} K") to see if they're available on the waiver wire.
            </p>
          </div>
          <div className="bg-primary/5 p-4 rounded-lg">
            <h4 className="font-semibold mb-2">Step 3: Add to Your Team</h4>
            <p className="text-sm text-muted-foreground">
              In ESPN Fantasy, navigate to "Players" → filter by "K" position → search for the kicker → click "Add" to claim them or add to your waiver claims.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* How It Works Section */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle>How Kicker Streaming Works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-semibold flex items-center gap-2 mb-2">
              <CloudSun className="w-4 h-4" />
              Dome Advantage (0-30 points)
            </h4>
            <p className="text-sm text-muted-foreground">
              Kickers in domes (30 pts) or retractable roof stadiums (20 pts) have better conditions - no wind, rain, or snow affecting kicks.
            </p>
          </div>
          <div>
            <h4 className="font-semibold flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4" />
              Vegas Matchup (0-30 points)
            </h4>
            <p className="text-sm text-muted-foreground">
              Underdogs (+15 pts) kick more field goals. High over/under totals (47+: 15 pts, 44-47: 10 pts) mean more scoring opportunities.
            </p>
          </div>
          <div>
            <h4 className="font-semibold flex items-center gap-2 mb-2">
              <Target className="w-4 h-4" />
              Red Zone Efficiency (0-25 points)
            </h4>
            <p className="text-sm text-muted-foreground">
              Teams with lower red zone TD rates stall more often, leading to more field goal attempts instead of touchdowns.
            </p>
          </div>
          <div>
            <h4 className="font-semibold flex items-center gap-2 mb-2">
              <Shield className="w-4 h-4" />
              Opponent Defense (0-15 points)
            </h4>
            <p className="text-sm text-muted-foreground">
              Facing a defense that allows more field goals (low opponent red zone TD rate) increases kicker opportunities.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
