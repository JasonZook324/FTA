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

  // Set default week to current week when league data loads
  useEffect(() => {
    if (currentLeague?.currentWeek && !fpWeek) {
      setFpWeek(currentLeague.currentWeek.toString());
    }
    if (currentLeague?.currentWeek && !nflWeek) {
      setNflWeek(currentLeague.currentWeek.toString());
    }
  }, [currentLeague?.currentWeek, fpWeek, nflWeek]);

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
      { endpoint: "/api/jobs/fantasypros-refresh-players", name: "Refresh Players" },
      { endpoint: "/api/jobs/fantasypros-refresh-rankings", name: "Refresh Rankings" },
      { endpoint: "/api/jobs/fantasypros-refresh-projections", name: "Refresh Projections" },
      { endpoint: "/api/jobs/fantasypros-refresh-news", name: "Refresh News" },
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
      { name: "Load Stadium Data", status: 'pending' },
      { name: "Refresh Vegas Odds", status: 'pending' },
      { name: "Refresh Team Stats", status: 'pending' },
      { name: "Calculate Red Zone Stats", status: 'pending' },
    ];
    setNflSteps(jobs);

    const jobConfigs = [
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
                placeholder="1"
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
