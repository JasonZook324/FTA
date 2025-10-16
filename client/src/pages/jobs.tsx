import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Database, TrendingUp } from "lucide-react";

export default function Jobs() {
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState(false);
  
  // Fantasy Pros parameters
  const [fpSport, setFpSport] = useState("NFL");
  const [fpSeason, setFpSeason] = useState("2025");
  const [fpWeek, setFpWeek] = useState("");

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
