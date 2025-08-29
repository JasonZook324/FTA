import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { RefreshCw, Calendar } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import MatchupCard from "@/components/matchup-card";

export default function Matchups() {
  const [userId] = useState("default-user");
  const [selectedLeagueId, setSelectedLeagueId] = useState<string>("");
  const [selectedWeek, setSelectedWeek] = useState<string>("");

  // Query user leagues
  const { data: leagues } = useQuery({
    queryKey: ["/api/leagues", userId],
  });

  // Query matchups data
  const { data: matchupsData, isLoading: matchupsLoading } = useQuery({
    queryKey: ["/api/leagues", selectedLeagueId, "matchups", selectedWeek].filter(Boolean),
    enabled: !!selectedLeagueId,
  });

  const selectedLeague = leagues?.find((l: any) => l.id === selectedLeagueId);
  const weekOptions = selectedLeague ? Array.from({ length: 17 }, (_, i) => i + 1) : [];

  return (
    <>
      {/* Header Bar */}
      <header className="bg-card border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Weekly Matchups</h2>
            <p className="text-muted-foreground">View head-to-head matchups and scores</p>
          </div>
          <div className="flex items-center space-x-3">
            <Select value={selectedLeagueId} onValueChange={setSelectedLeagueId}>
              <SelectTrigger className="w-48" data-testid="select-league">
                <SelectValue placeholder="Select a league" />
              </SelectTrigger>
              <SelectContent>
                {leagues?.map((league: any) => (
                  <SelectItem key={league.id} value={league.id}>
                    {league.name} ({league.season})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            {selectedLeagueId && (
              <Select value={selectedWeek} onValueChange={setSelectedWeek}>
                <SelectTrigger className="w-32" data-testid="select-week">
                  <SelectValue placeholder="Week" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Current</SelectItem>
                  {weekOptions.map((week) => (
                    <SelectItem key={week} value={week.toString()}>
                      Week {week}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            
            <Button
              variant="secondary"
              onClick={() => queryClient.invalidateQueries({ 
                queryKey: ["/api/leagues", selectedLeagueId, "matchups"] 
              })}
              disabled={!selectedLeagueId}
              data-testid="button-refresh"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-auto p-6">
        {!selectedLeagueId ? (
          <Card className="h-96">
            <CardContent className="flex items-center justify-center h-full">
              <div className="text-center">
                <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">Select a league to view matchups</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <MatchupCard 
            data={matchupsData} 
            isLoading={matchupsLoading}
            leagueId={selectedLeagueId}
            week={selectedWeek}
          />
        )}
      </main>
    </>
  );
}
