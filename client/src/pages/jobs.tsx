import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Database, TrendingUp, Activity } from "lucide-react";

export default function Jobs() {
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState(false);
  
  // Fetch leagues to get current week
  const { data: leagues } = useQuery<any[]>({
    queryKey: ['/api/leagues'],
  });
  const currentLeague = leagues?.[0];
  
  // Fantasy Pros parameters
  const [fpSport, setFpSport] = useState("NFL");
  const [fpSeason, setFpSeason] = useState("2025");
  const [fpWeek, setFpWeek] = useState("");

  // NFL Stats & Odds parameters
  const [nflSeason, setNflSeason] = useState("2025");
  const [nflWeek, setNflWeek] = useState("");

  // Set default week to current week when league data loads
  useEffect(() => {
    if (currentLeague?.currentWeek && !fpWeek) {
      setFpWeek(currentLeague.currentWeek.toString());
    }
    if (currentLeague?.currentWeek && !nflWeek) {
      setNflWeek(currentLeague.currentWeek.toString());
    }
  }, [currentLeague?.currentWeek, fpWeek, nflWeek]);

  async function runJob(endpoint: string, label: string, body?: any) {
    setLoading(true);
    setStatus("");
    try {
      const res = await fetch(endpoint, { 
        method: "POST",
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      setStatus(`${label}: ${data.message || "Success"}`);
    } catch (err) {
      setStatus(`${label}: Failed (${err})`);
    } finally {
      setLoading(false);
    }
  }

  const getFantasyProsBody = (includeWeek = false) => {
    const body: any = {
      sport: fpSport,
      season: parseInt(fpSeason),
    };
    if (includeWeek && fpWeek) {
      body.week = parseInt(fpWeek);
    }
    return body;
  };

  return (
    <div className="container max-w-4xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Jobs & Data Refresh</h1>
        <p className="text-muted-foreground mt-2">
          Refresh contextual data from Fantasy Pros API to use in prompt building
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
                placeholder="Leave empty for season"
              />
            </div>
          </div>

          {/* Refresh Buttons */}
          <div className="grid grid-cols-2 gap-3">
            <Button
              data-testid="button-fp-refresh-players"
              disabled={loading}
              onClick={() => runJob(
                "/api/jobs/fp-refresh-players",
                "Refresh Players",
                getFantasyProsBody(false)
              )}
              variant="outline"
            >
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Refresh Players
            </Button>

            <Button
              data-testid="button-fp-refresh-rankings"
              disabled={loading}
              onClick={() => runJob(
                "/api/jobs/fp-refresh-rankings",
                "Refresh Rankings",
                getFantasyProsBody(true)
              )}
              variant="outline"
            >
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Refresh Rankings
            </Button>

            <Button
              data-testid="button-fp-refresh-projections"
              disabled={loading}
              onClick={() => runJob(
                "/api/jobs/fp-refresh-projections",
                "Refresh Projections",
                getFantasyProsBody(true)
              )}
              variant="outline"
            >
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Refresh Projections
            </Button>

            <Button
              data-testid="button-fp-refresh-news"
              disabled={loading}
              onClick={() => runJob(
                "/api/jobs/fp-refresh-news",
                "Refresh News",
                { sport: fpSport, limit: 50 }
              )}
              variant="outline"
            >
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Refresh News
            </Button>
          </div>

          <Separator />

          {/* Clear and Refresh News Button */}
          <Button
            data-testid="button-fp-clear-refresh-news"
            disabled={loading}
            onClick={() => runJob(
              "/api/jobs/fp-clear-and-refresh-news",
              "Clear and Refresh News",
              { sport: fpSport, limit: 50 }
            )}
            variant="destructive"
            className="w-full"
          >
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Clear and Refresh News (Fixes old records with missing player data)
          </Button>

          <Separator />

          {/* Refresh All Button */}
          <Button
            data-testid="button-fp-refresh-all"
            disabled={loading}
            onClick={() => runJob(
              "/api/jobs/fp-refresh-all",
              "Refresh All Data",
              getFantasyProsBody(true)
            )}
            className="w-full"
            size="lg"
          >
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Refresh All Data (Players, Rankings, Projections, News)
          </Button>
        </CardContent>
      </Card>

      {/* ESPN Data Refresh (Placeholder) */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            <CardTitle>ESPN Data</CardTitle>
          </div>
          <CardDescription>
            Refresh league, team, and player data from ESPN API
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            data-testid="button-refresh-leagues"
            disabled={loading}
            onClick={() => runJob("/api/jobs/refresh-leagues", "Refresh Leagues")}
            variant="outline"
            className="w-full"
          >
            Refresh Leagues
          </Button>
          <Button
            data-testid="button-refresh-teams"
            disabled={loading}
            onClick={() => runJob("/api/jobs/refresh-teams", "Refresh Teams")}
            variant="outline"
            className="w-full"
          >
            Refresh Teams
          </Button>
          <Button
            data-testid="button-refresh-players"
            disabled={loading}
            onClick={() => runJob("/api/jobs/refresh-players", "Refresh Players")}
            variant="outline"
            className="w-full"
          >
            Refresh Players
          </Button>
        </CardContent>
      </Card>

      {/* NFL Stats & Odds Data Refresh */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            <CardTitle>NFL Stats & Odds</CardTitle>
          </div>
          <CardDescription>
            Refresh NFL stadium data and Vegas odds for kicker streaming analysis
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
              />
            </div>
          </div>

          {/* Refresh Buttons */}
          <div className="space-y-3">
            <Button
              data-testid="button-nfl-refresh-stadiums"
              disabled={loading}
              onClick={() => runJob(
                "/api/jobs/nfl-refresh-stadiums",
                "Refresh NFL Stadiums"
              )}
              variant="outline"
              className="w-full"
            >
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Load Stadium Data (Domes & Retractable Roofs)
            </Button>

            <Button
              data-testid="button-nfl-refresh-odds"
              disabled={loading}
              onClick={() => runJob(
                "/api/jobs/nfl-refresh-odds",
                "Refresh NFL Odds",
                {
                  season: parseInt(nflSeason),
                  week: parseInt(nflWeek)
                }
              )}
              variant="outline"
              className="w-full"
            >
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Refresh Vegas Odds (The Odds API)
            </Button>

            <Button
              data-testid="button-nfl-refresh-team-stats"
              disabled={loading}
              onClick={() => runJob(
                "/api/jobs/nfl-refresh-team-stats",
                "Refresh NFL Team Stats",
                {
                  season: parseInt(nflSeason),
                  week: nflWeek ? parseInt(nflWeek) : null
                }
              )}
              variant="outline"
              className="w-full"
            >
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Refresh Team Stats (ESPN API)
            </Button>

            <Button
              data-testid="button-nfl-refresh-red-zone-stats"
              disabled={loading}
              onClick={() => runJob(
                "/api/jobs/nfl-refresh-red-zone-stats",
                "Calculate Red Zone Stats",
                {
                  season: parseInt(nflSeason),
                  week: parseInt(nflWeek)
                }
              )}
              variant="outline"
              className="w-full"
            >
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Calculate Red Zone Stats (Play-by-Play)
            </Button>
          </div>
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
