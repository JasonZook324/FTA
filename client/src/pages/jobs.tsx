import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Database, TrendingUp, Activity, CheckCircle2, Circle, AlertCircle } from "lucide-react";
import { Progress } from "@/components/ui/progress";

type JobStep = {
  name: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  message?: string;
};

export default function Jobs() {
  const [status, setStatus] = useState<string>("");
  
  // Fetch leagues to get current week
  const { data: leagues } = useQuery<any[]>({
    queryKey: ['/api/leagues'],
  });
  const currentLeague = leagues?.[0];
  
  // Fantasy Pros parameters
  const [fpSport, setFpSport] = useState("NFL");
  const [fpSeason, setFpSeason] = useState("2025");
  const [fpWeek, setFpWeek] = useState("");
  const [fpSteps, setFpSteps] = useState<JobStep[]>([]);
  const [fpRunning, setFpRunning] = useState(false);

  // NFL Stats & Odds parameters
  const [nflSeason, setNflSeason] = useState("2025");
  const [nflWeek, setNflWeek] = useState("");
  const [nflSteps, setNflSteps] = useState<JobStep[]>([]);
  const [nflRunning, setNflRunning] = useState(false);

  // NFL Player Matchups parameters
  const [matchupsSeason, setMatchupsSeason] = useState("2025");
  const [matchupsWeek, setMatchupsWeek] = useState("");
  const [matchupsRunning, setMatchupsRunning] = useState(false);
  const [matchupsMessage, setMatchupsMessage] = useState("");

  // Defensive Rankings Validation parameters
  const [defRankSeason, setDefRankSeason] = useState("2025");
  const [defRankWeek, setDefRankWeek] = useState("");
  const [defRankValidating, setDefRankValidating] = useState(false);
  const [defRankResult, setDefRankResult] = useState<any>(null);

  // Unified Player Data parameters
  const [unifiedSeason, setUnifiedSeason] = useState(new Date().getFullYear().toString());
  const [unifiedSteps, setUnifiedSteps] = useState<JobStep[]>([]);
  const [unifiedRunning, setUnifiedRunning] = useState(false);
  
  // Players Master Viewer parameters
  const [viewerSeason, setViewerSeason] = useState(new Date().getFullYear().toString());
  const [viewerTeam, setViewerTeam] = useState<string>("");
  const [viewerPosition, setViewerPosition] = useState<string>("");
  const [viewerPlayers, setViewerPlayers] = useState<any[]>([]);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [viewerError, setViewerError] = useState<string>("");
  const [selectedPlayer, setSelectedPlayer] = useState<any>(null);
  
  // Get scoring type from the user's league settings
  const leagueScoringType = currentLeague?.scoringType || "PPR";

  // Set default week to current week when league data loads
  useEffect(() => {
    if (currentLeague?.currentWeek && !fpWeek) {
      setFpWeek(currentLeague.currentWeek.toString());
    }
    if (currentLeague?.currentWeek && !nflWeek) {
      setNflWeek(currentLeague.currentWeek.toString());
    }
    if (currentLeague?.currentWeek && !matchupsWeek) {
      setMatchupsWeek(currentLeague.currentWeek.toString());
    }
    if (currentLeague?.currentWeek && !defRankWeek) {
      setDefRankWeek(currentLeague.currentWeek.toString());
    }
  }, [currentLeague?.currentWeek, fpWeek, nflWeek, matchupsWeek, defRankWeek]);

  async function runJob(endpoint: string, body?: any): Promise<{ success: boolean; message: string }> {
    try {
      const res = await fetch(endpoint, { 
        method: "POST",
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      return { 
        success: res.ok, 
        message: data.message || (res.ok ? "Success" : "Failed")
      };
    } catch (err: any) {
      return { success: false, message: err.message || "Failed" };
    }
  }

  async function runFantasyProsJobs() {
    setFpRunning(true);
    setStatus("");
    
    const jobs: JobStep[] = [
      { name: "Refresh Players", status: 'pending' },
      { name: "Refresh Rankings", status: 'pending' },
      { name: "Refresh Projections", status: 'pending' },
      { name: "Refresh News", status: 'pending' },
    ];
    setFpSteps(jobs);

    const jobConfigs = [
      { endpoint: "/api/jobs/fp-refresh-players", name: "Refresh Players" },
      { endpoint: "/api/jobs/fp-refresh-rankings", name: "Refresh Rankings" },
      { endpoint: "/api/jobs/fp-refresh-projections", name: "Refresh Projections" },
      { endpoint: "/api/jobs/fp-refresh-news", name: "Refresh News" },
    ];

    for (let i = 0; i < jobConfigs.length; i++) {
      const config = jobConfigs[i];
      
      // Mark as running
      setFpSteps(prev => prev.map((step, idx) => 
        idx === i ? { ...step, status: 'running' } : step
      ));

      // Run the job
      const body: any = {
        sport: fpSport,
        season: parseInt(fpSeason),
      };
      if (fpWeek) body.week = parseInt(fpWeek);

      const result = await runJob(config.endpoint, body);

      // Mark as completed or error
      setFpSteps(prev => prev.map((step, idx) => 
        idx === i ? { 
          ...step, 
          status: result.success ? 'completed' : 'error',
          message: result.message
        } : step
      ));

      if (!result.success) {
        setStatus(`Failed at: ${config.name} - ${result.message}`);
        break;
      }
    }

    setFpRunning(false);
    const allSuccess = fpSteps.every(s => s.status === 'completed');
    if (allSuccess) {
      setStatus("✓ All Fantasy Pros data refreshed successfully!");
    }
  }

  async function runNFLJobs() {
    if (!nflWeek) {
      setStatus("Please enter a week number for NFL data refresh");
      return;
    }

    setNflRunning(true);
    setStatus("");
    
    const jobs: JobStep[] = [
      { name: "Cleanup Old Vegas Odds", status: 'pending' },
      { name: "Load Stadium Data", status: 'pending' },
      { name: "Refresh Vegas Odds", status: 'pending' },
      { name: "Refresh Team Stats", status: 'pending' },
      { name: "Calculate Red Zone Stats", status: 'pending' },
    ];
    setNflSteps(jobs);

    const jobConfigs = [
      { endpoint: "/api/jobs/nfl-cleanup-vegas-odds", name: "Cleanup Old Vegas Odds", body: {} },
      { endpoint: "/api/jobs/nfl-refresh-stadiums", name: "Load Stadium Data", body: {} },
      { 
        endpoint: "/api/jobs/nfl-refresh-odds", 
        name: "Refresh Vegas Odds",
        body: { season: parseInt(nflSeason), week: parseInt(nflWeek) }
      },
      { 
        endpoint: "/api/jobs/nfl-refresh-team-stats", 
        name: "Refresh Team Stats",
        body: { season: parseInt(nflSeason), week: parseInt(nflWeek) }
      },
      { 
        endpoint: "/api/jobs/nfl-refresh-red-zone-stats", 
        name: "Calculate Red Zone Stats",
        body: { season: parseInt(nflSeason), week: parseInt(nflWeek) }
      },
    ];

    for (let i = 0; i < jobConfigs.length; i++) {
      const config = jobConfigs[i];
      
      // Mark as running
      setNflSteps(prev => prev.map((step, idx) => 
        idx === i ? { ...step, status: 'running' } : step
      ));

      // Run the job
      const result = await runJob(config.endpoint, config.body);

      // Mark as completed or error
      setNflSteps(prev => prev.map((step, idx) => 
        idx === i ? { 
          ...step, 
          status: result.success ? 'completed' : 'error',
          message: result.message
        } : step
      ));

      if (!result.success) {
        setStatus(`Failed at: ${config.name} - ${result.message}`);
        break;
      }
    }

    setNflRunning(false);
    const allSuccess = nflSteps.every(s => s.status === 'completed');
    if (allSuccess) {
      setStatus("✓ All NFL kicker streaming data refreshed successfully!");
    }
  }

  async function runPlayerMatchupsJob() {
    if (!matchupsWeek) {
      setMatchupsMessage("Please enter a week number");
      return;
    }

    setMatchupsRunning(true);
    setMatchupsMessage("Refreshing NFL player matchups...");

    const result = await runJob("/api/jobs/nfl-refresh-matchups", {
      season: parseInt(matchupsSeason),
      week: parseInt(matchupsWeek)
    });

    setMatchupsRunning(false);
    if (result.success) {
      setMatchupsMessage(`✓ ${result.message}`);
    } else {
      setMatchupsMessage(`✗ ${result.message}`);
    }
  }

  async function validateDefensiveRankings() {
    setDefRankValidating(true);
    setDefRankResult(null);

    try {
      const res = await fetch(`/api/nfl/defensive-rankings/validate/${defRankSeason}/${defRankWeek}`);
      const data = await res.json();
      setDefRankResult(data);
    } catch (err: any) {
      setDefRankResult({
        error: true,
        message: err.message || "Failed to validate defensive rankings"
      });
    }

    setDefRankValidating(false);
  }

  async function runUnifiedPlayerJobs() {
    setUnifiedRunning(true);
    setStatus("");
    
    const jobs: JobStep[] = [
      { name: "Refresh ESPN Players", status: 'pending' },
      { name: "Refresh FP Players", status: 'pending' },
      { name: "Refresh Defense Stats", status: 'pending' },
      { name: "Build Crosswalk", status: 'pending' },
      { name: "Refresh Players Master", status: 'pending' },
    ];
    setUnifiedSteps(jobs);

    const jobConfigs = [
      { 
        endpoint: "/api/jobs/unified-refresh-espn-players", 
        name: "Refresh ESPN Players",
        body: { sport: "NFL", season: parseInt(unifiedSeason) }
      },
      { 
        endpoint: "/api/jobs/unified-refresh-fp-players", 
        name: "Refresh FP Players",
        body: { sport: "NFL", season: parseInt(unifiedSeason) }
      },
      { 
        endpoint: "/api/jobs/unified-refresh-defense-stats", 
        name: "Refresh Defense Stats",
        body: { sport: "NFL", season: parseInt(unifiedSeason), scoringType: leagueScoringType }
      },
      { 
        endpoint: "/api/jobs/unified-build-crosswalk", 
        name: "Build Crosswalk",
        body: { sport: "NFL", season: parseInt(unifiedSeason) }
      },
      { 
        endpoint: "/api/jobs/unified-refresh-players-master", 
        name: "Refresh Players Master",
        body: {}
      },
    ];

    for (let i = 0; i < jobConfigs.length; i++) {
      const config = jobConfigs[i];
      
      setUnifiedSteps(prev => prev.map((step, idx) => 
        idx === i ? { ...step, status: 'running' } : step
      ));

      const result = await runJob(config.endpoint, config.body);

      setUnifiedSteps(prev => prev.map((step, idx) => 
        idx === i ? { 
          ...step, 
          status: result.success ? 'completed' : 'error',
          message: result.message
        } : step
      ));

      if (!result.success) {
        setStatus(`Failed at: ${config.name} - ${result.message}`);
        setUnifiedRunning(false);
        return;
      }
    }

    setUnifiedRunning(false);
    setStatus("✓ All unified player data refreshed successfully!");
  }

  async function fetchPlayersMaster() {
    setViewerLoading(true);
    setViewerError("");
    setSelectedPlayer(null);
    
    try {
      let url = `/api/players/unified/NFL/${viewerSeason}`;
      const params = new URLSearchParams();
      if (viewerTeam && viewerTeam !== 'all') params.append('team', viewerTeam);
      if (viewerPosition && viewerPosition !== 'all') params.append('position', viewerPosition);
      if (params.toString()) url += `?${params.toString()}`;
      
      const res = await fetch(url);
      const data = await res.json();
      
      if (res.ok) {
        setViewerPlayers(data.players || []);
      } else {
        setViewerError(data.message || 'Failed to fetch players');
        setViewerPlayers([]);
      }
    } catch (err: any) {
      setViewerError(err.message || 'Failed to fetch players');
      setViewerPlayers([]);
    }
    
    setViewerLoading(false);
  }

  const NFL_TEAMS = [
    'ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE',
    'DAL', 'DEN', 'DET', 'GB', 'HOU', 'IND', 'JAX', 'KC',
    'LAC', 'LAR', 'LV', 'MIA', 'MIN', 'NE', 'NO', 'NYG',
    'NYJ', 'PHI', 'PIT', 'SEA', 'SF', 'TB', 'TEN', 'WAS'
  ];

  const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];

  const getStepProgress = (steps: JobStep[]) => {
    const completed = steps.filter(s => s.status === 'completed').length;
    return (completed / steps.length) * 100;
  };

  const StepIndicator = ({ step }: { step: JobStep }) => {
    return (
      <div className="flex items-center gap-3 py-2">
        <div className="flex-shrink-0">
          {step.status === 'completed' && (
            <CheckCircle2 className="w-5 h-5 text-green-600" />
          )}
          {step.status === 'running' && (
            <Loader2 className="w-5 h-5 text-primary animate-spin" />
          )}
          {step.status === 'error' && (
            <AlertCircle className="w-5 h-5 text-destructive" />
          )}
          {step.status === 'pending' && (
            <Circle className="w-5 h-5 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm">{step.name}</div>
          {step.message && (
            <div className="text-xs text-muted-foreground truncate">{step.message}</div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="container max-w-4xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Jobs & Data Refresh</h1>
        <p className="text-muted-foreground mt-2">
          Automatically refresh all required data in the correct sequence
        </p>
      </div>

      {/* Fantasy Pros Data Refresh */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            <CardTitle>Fantasy Pros Data</CardTitle>
          </div>
          <CardDescription>
            Refresh player rankings, projections, and news from Fantasy Pros API
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Parameters */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-muted/50 rounded-lg">
            <div className="space-y-2">
              <Label htmlFor="fp-sport">Sport</Label>
              <Select value={fpSport} onValueChange={setFpSport}>
                <SelectTrigger id="fp-sport" data-testid="select-fp-sport">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NFL">NFL</SelectItem>
                  <SelectItem value="NBA">NBA</SelectItem>
                  <SelectItem value="NHL">NHL</SelectItem>
                  <SelectItem value="MLB">MLB</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="fp-season">Season</Label>
              <Input
                id="fp-season"
                data-testid="input-fp-season"
                type="number"
                value={fpSeason}
                onChange={(e) => setFpSeason(e.target.value)}
                placeholder="2025"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="fp-week">Week (Optional)</Label>
              <Input
                id="fp-week"
                data-testid="input-fp-week"
                type="number"
                value={fpWeek}
                onChange={(e) => setFpWeek(e.target.value)}
                placeholder="Current week"
              />
            </div>
          </div>

          {/* Progress Steps */}
          {fpSteps.length > 0 && (
            <div className="space-y-2">
              <Progress value={getStepProgress(fpSteps)} className="h-2" />
              <div className="space-y-1">
                {fpSteps.map((step, idx) => (
                  <StepIndicator key={idx} step={step} />
                ))}
              </div>
            </div>
          )}

          {/* Refresh Button */}
          <Button
            data-testid="button-refresh-all-fantasypros"
            disabled={fpRunning}
            onClick={runFantasyProsJobs}
            className="w-full"
            size="lg"
          >
            {fpRunning && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Refresh All Fantasy Pros Data
          </Button>
        </CardContent>
      </Card>

      {/* NFL Stats & Odds Data Refresh */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            <CardTitle>NFL Kicker Streaming Data</CardTitle>
          </div>
          <CardDescription>
            Refresh all data required for kicker streaming analysis (stadiums, odds, stats, red zone)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Parameters */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg">
            <div className="space-y-2">
              <Label htmlFor="nfl-season">Season</Label>
              <Input
                id="nfl-season"
                data-testid="input-nfl-season"
                type="number"
                value={nflSeason}
                onChange={(e) => setNflSeason(e.target.value)}
                placeholder="2025"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="nfl-week">Week</Label>
              <Input
                id="nfl-week"
                data-testid="input-nfl-week"
                type="number"
                value={nflWeek}
                onChange={(e) => setNflWeek(e.target.value)}
                placeholder={currentLeague?.currentWeek ? `Current: ${currentLeague.currentWeek}` : "Enter week"}
                required
              />
            </div>
          </div>

          {/* Progress Steps */}
          {nflSteps.length > 0 && (
            <div className="space-y-2">
              <Progress value={getStepProgress(nflSteps)} className="h-2" />
              <div className="space-y-1">
                {nflSteps.map((step, idx) => (
                  <StepIndicator key={idx} step={step} />
                ))}
              </div>
            </div>
          )}

          {/* Refresh Button */}
          <Button
            data-testid="button-refresh-all-nfl"
            disabled={nflRunning || !nflWeek}
            onClick={runNFLJobs}
            className="w-full"
            size="lg"
          >
            {nflRunning && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Refresh All Kicker Streaming Data
          </Button>
          {!nflWeek && (
            <p className="text-sm text-muted-foreground text-center">
              Please enter a week number to refresh NFL data
            </p>
          )}
        </CardContent>
      </Card>

      {/* NFL Player Matchups Refresh */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            <CardTitle>NFL Player Matchups</CardTitle>
          </div>
          <CardDescription>
            Refresh player opponent and game time data for the Players page
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Parameters */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg">
            <div className="space-y-2">
              <Label htmlFor="matchups-season">Season</Label>
              <Input
                id="matchups-season"
                data-testid="input-matchups-season"
                type="number"
                value={matchupsSeason}
                onChange={(e) => setMatchupsSeason(e.target.value)}
                placeholder="2025"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="matchups-week">Week</Label>
              <Input
                id="matchups-week"
                data-testid="input-matchups-week"
                type="number"
                value={matchupsWeek}
                onChange={(e) => setMatchupsWeek(e.target.value)}
                placeholder={currentLeague?.currentWeek ? `Current: ${currentLeague.currentWeek}` : "Enter week"}
                required
              />
            </div>
          </div>

          {/* Status Message */}
          {matchupsMessage && (
            <div className="p-3 bg-muted rounded-md">
              <p className="text-sm">{matchupsMessage}</p>
            </div>
          )}

          {/* Refresh Button */}
          <Button
            data-testid="button-refresh-matchups"
            disabled={matchupsRunning || !matchupsWeek}
            onClick={runPlayerMatchupsJob}
            className="w-full"
            size="lg"
          >
            {matchupsRunning && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Refresh Player Matchups
          </Button>
          {!matchupsWeek && (
            <p className="text-sm text-muted-foreground text-center">
              Please enter a week number to refresh matchups
            </p>
          )}
        </CardContent>
      </Card>

      {/* Defensive Rankings Validation */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            <CardTitle>Defensive Rankings Validation</CardTitle>
          </div>
          <CardDescription>
            Validate NFL defensive rankings data coverage and identify missing teams
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Parameters */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg">
            <div className="space-y-2">
              <Label htmlFor="defrank-season">Season</Label>
              <Input
                id="defrank-season"
                data-testid="input-defrank-season"
                type="number"
                value={defRankSeason}
                onChange={(e) => setDefRankSeason(e.target.value)}
                placeholder="2025"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="defrank-week">Week</Label>
              <Input
                id="defrank-week"
                data-testid="input-defrank-week"
                type="number"
                value={defRankWeek}
                onChange={(e) => setDefRankWeek(e.target.value)}
                placeholder={currentLeague?.currentWeek ? `Current: ${currentLeague.currentWeek}` : "Enter week"}
                required
              />
            </div>
          </div>

          {/* Validation Results */}
          {defRankResult && (
            <div className="space-y-3 p-4 bg-muted rounded-md">
              {defRankResult.error ? (
                <div className="flex items-center gap-2 text-destructive">
                  <AlertCircle className="h-5 w-5" />
                  <span className="font-medium">{defRankResult.message}</span>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Status:</span>
                    <div className="flex items-center gap-2">
                      {defRankResult.isComplete ? (
                        <>
                          <CheckCircle2 className="h-5 w-5 text-green-600" />
                          <span className="text-green-600 font-medium">Complete</span>
                        </>
                      ) : (
                        <>
                          <AlertCircle className="h-5 w-5 text-yellow-600" />
                          <span className="text-yellow-600 font-medium">Incomplete</span>
                        </>
                      )}
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Teams with data:</span>
                      <span className="ml-2 font-medium">{defRankResult.coverage?.teamsWithData}/{defRankResult.coverage?.totalTeams}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Total mappings:</span>
                      <span className="ml-2 font-medium">{defRankResult.totalMappings}</span>
                    </div>
                  </div>

                  {defRankResult.coverage?.teamsMissingData?.length > 0 && (
                    <div className="mt-3">
                      <span className="text-sm font-medium text-destructive">Missing teams:</span>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {defRankResult.coverage.teamsMissingData.map((team: string) => (
                          <span key={team} className="px-2 py-1 bg-destructive/10 text-destructive rounded text-xs">
                            {team}
                          </span>
                        ))}
                      </div>
                      <p className="mt-3 text-sm text-muted-foreground">
                        ℹ️ Missing teams need to be added to the nflTeamStats table. Run the "Refresh All Kicker Streaming Data" job above to sync NFL team statistics.
                      </p>
                    </div>
                  )}

                  {defRankResult.coverage?.duplicateRanks?.length > 0 && (
                    <div className="mt-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded">
                      <span className="text-sm font-medium text-yellow-800 dark:text-yellow-200">⚠️ Duplicate Ranks Found:</span>
                      <div className="mt-2 space-y-1 text-sm">
                        {defRankResult.coverage.duplicateRanks.map((dup: any) => (
                          <div key={dup.rank}>
                            Rank #{dup.rank}: {dup.teams.join(', ')}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Validate Button */}
          <Button
            data-testid="button-validate-defrank"
            disabled={defRankValidating || !defRankWeek}
            onClick={validateDefensiveRankings}
            className="w-full"
            size="lg"
          >
            {defRankValidating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Validate Defensive Rankings
          </Button>
          {!defRankWeek && (
            <p className="text-sm text-muted-foreground text-center">
              Please enter a week number to validate
            </p>
          )}
        </CardContent>
      </Card>

      {/* Unified Player Data Refresh */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            <CardTitle>Unified Player Data</CardTitle>
          </div>
          <CardDescription>
            Build the unified player database by combining ESPN and FantasyPros data into a single view.
            Includes OPRK (opponent rank) calculations and player ID crosswalk.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Parameters */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg">
            <div className="space-y-2">
              <Label htmlFor="unified-season">Season</Label>
              <Input
                id="unified-season"
                data-testid="input-unified-season"
                type="number"
                value={unifiedSeason}
                onChange={(e) => setUnifiedSeason(e.target.value)}
                placeholder={new Date().getFullYear().toString()}
              />
            </div>

            <div className="space-y-2">
              <Label>Scoring Type</Label>
              <div className="h-10 px-3 py-2 bg-muted/50 border border-input rounded-md flex items-center text-sm">
                {leagueScoringType}
                <span className="ml-2 text-xs text-muted-foreground">(from league settings)</span>
              </div>
            </div>
          </div>

          {/* Progress Steps */}
          {unifiedSteps.length > 0 && (
            <div className="space-y-2">
              <Progress value={getStepProgress(unifiedSteps)} className="h-2" />
              <div className="space-y-1">
                {unifiedSteps.map((step, idx) => (
                  <StepIndicator key={idx} step={step} />
                ))}
              </div>
            </div>
          )}

          {/* Info Box */}
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-md text-sm">
            <p className="font-medium text-blue-800 dark:text-blue-200 mb-2">This job will:</p>
            <ol className="list-decimal list-inside space-y-1 text-blue-700 dark:text-blue-300">
              <li>Fetch player data from ESPN API → espn_player_data table</li>
              <li>Copy existing FP players → fp_player_data table</li>
              <li>Calculate defense vs position rankings → defense_vs_position_stats table</li>
              <li>Match ESPN to FP players → player_crosswalk table</li>
              <li>Refresh the unified players_master view</li>
            </ol>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <Button
              data-testid="button-refresh-unified-players"
              disabled={unifiedRunning}
              onClick={runUnifiedPlayerJobs}
              className="flex-1"
              size="lg"
            >
              {unifiedRunning && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Refresh All Unified Player Data
            </Button>
            <Button
              data-testid="button-clear-unified-data"
              variant="outline"
              disabled={unifiedRunning}
              onClick={async () => {
                setStatus("Clearing unified player data...");
                const result = await runJob("/api/jobs/unified-clear-data");
                setStatus(result.success ? "✓ Unified player data cleared" : `Failed: ${result.message}`);
                setUnifiedSteps([]);
              }}
              size="lg"
            >
              Clear Data
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Players Master Viewer */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            <CardTitle>Players Master Viewer</CardTitle>
          </div>
          <CardDescription>
            Test and view the merged player data from the players_master materialized view.
            See how ESPN and FantasyPros data are combined into unified player objects.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-muted/50 rounded-lg">
            <div className="space-y-2">
              <Label htmlFor="viewer-season">Season</Label>
              <Input
                id="viewer-season"
                data-testid="input-viewer-season"
                type="number"
                value={viewerSeason}
                onChange={(e) => setViewerSeason(e.target.value)}
                placeholder={new Date().getFullYear().toString()}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="viewer-team">Team (Optional)</Label>
              <Select value={viewerTeam} onValueChange={setViewerTeam}>
                <SelectTrigger data-testid="select-viewer-team">
                  <SelectValue placeholder="All Teams" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Teams</SelectItem>
                  {NFL_TEAMS.map(team => (
                    <SelectItem key={team} value={team}>{team}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="viewer-position">Position (Optional)</Label>
              <Select value={viewerPosition} onValueChange={setViewerPosition}>
                <SelectTrigger data-testid="select-viewer-position">
                  <SelectValue placeholder="All Positions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Positions</SelectItem>
                  {POSITIONS.map(pos => (
                    <SelectItem key={pos} value={pos}>{pos}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end">
              <Button
                data-testid="button-fetch-players-master"
                onClick={fetchPlayersMaster}
                disabled={viewerLoading}
                className="w-full"
              >
                {viewerLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Fetch Players
              </Button>
            </div>
          </div>

          {/* Error Display */}
          {viewerError && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-md text-sm text-red-700 dark:text-red-300">
              {viewerError}
            </div>
          )}

          {/* Results Summary */}
          {viewerPlayers.length > 0 && (
            <div className="text-sm text-muted-foreground">
              Found {viewerPlayers.length} players
            </div>
          )}

          {/* Players Table */}
          {viewerPlayers.length > 0 && (
            <div className="border rounded-lg overflow-hidden">
              <div className="overflow-x-auto max-h-96">
                <table className="w-full text-sm">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="text-left p-3 font-medium">Name</th>
                      <th className="text-left p-3 font-medium">Team</th>
                      <th className="text-left p-3 font-medium">Pos</th>
                      <th className="text-left p-3 font-medium">ESPN ID</th>
                      <th className="text-left p-3 font-medium">FP ID</th>
                      <th className="text-left p-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {viewerPlayers.slice(0, 100).map((player, idx) => (
                      <tr key={idx} className="hover:bg-muted/50">
                        <td className="p-3">{player.full_name || player.fullName}</td>
                        <td className="p-3">{player.team}</td>
                        <td className="p-3">{player.position}</td>
                        <td className="p-3 font-mono text-xs">{player.espn_player_id || '-'}</td>
                        <td className="p-3 font-mono text-xs">{player.fp_player_id || '-'}</td>
                        <td className="p-3">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedPlayer(player)}
                            data-testid={`button-view-player-${idx}`}
                          >
                            View JSON
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {viewerPlayers.length > 100 && (
                <div className="p-3 bg-muted text-sm text-muted-foreground text-center">
                  Showing first 100 of {viewerPlayers.length} players. Use filters to narrow results.
                </div>
              )}
            </div>
          )}

          {/* Selected Player JSON */}
          {selectedPlayer && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Player Object JSON</Label>
                <Button variant="ghost" size="sm" onClick={() => setSelectedPlayer(null)}>
                  Close
                </Button>
              </div>
              <div className="p-4 bg-muted rounded-lg overflow-x-auto max-h-96">
                <pre className="text-xs font-mono whitespace-pre-wrap">
                  {JSON.stringify(selectedPlayer, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Status Display */}
      {status && (
        <Card>
          <CardContent className="pt-6">
            <div className="p-4 bg-muted rounded-md">
              <p className="text-sm font-mono">{status}</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
