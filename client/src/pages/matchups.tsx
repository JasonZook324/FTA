import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import MatchupCard from "@/components/matchup-card";
import { useAuth } from "@/hooks/use-auth";

export default function Matchups() {
  const { user } = useAuth();
  const [selectedWeek, setSelectedWeek] = useState<string>("");

  // Query user leagues
  const { data: leagues } = useQuery<any[]>({
    queryKey: ["/api/leagues"],
    enabled: !!user,
  });

  // Auto-select the first (and only) league
  const selectedLeagueId = leagues?.[0]?.id;
  const selectedLeague = leagues?.[0];

  // Auto-select the current week from league data when it loads
  useEffect(() => {
    if (selectedLeague?.currentWeek && !selectedWeek) {
      setSelectedWeek(selectedLeague.currentWeek.toString());
    }
  }, [selectedLeague, selectedWeek]);

  // Query matchups data
  const { data: matchupsData, isLoading: matchupsLoading } = useQuery({
    queryKey: ["/api/leagues", selectedLeagueId, "matchups", selectedWeek].filter(Boolean),
    queryFn: async () => {
      const weekParam = selectedWeek ? `?week=${selectedWeek}` : "";
      const url = `/api/leagues/${selectedLeagueId}/matchups${weekParam}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch matchups: ${response.status}`);
      }
      return response.json();
    },
    enabled: !!selectedLeagueId && !!selectedWeek,
  });

  const weekOptions = selectedLeague ? Array.from({ length: 17 }, (_, i) => i + 1) : [];

  return (
    <>
      {/* Header Bar */}
      <header className="bg-card border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Weekly Matchups</h2>
            <p className="text-muted-foreground">
              {selectedLeague 
                ? `${selectedLeague.name} (${selectedLeague.season}) - Week ${selectedWeek || selectedLeague.currentWeek}`
                : "View head-to-head matchups and scores"}
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <Select value={selectedWeek} onValueChange={setSelectedWeek}>
              <SelectTrigger className="w-32" data-testid="select-week">
                <SelectValue placeholder="Week" />
              </SelectTrigger>
              <SelectContent>
                {weekOptions.map((week) => (
                  <SelectItem key={week} value={week.toString()}>
                    Week {week}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Button
              variant="secondary"
              onClick={() => queryClient.invalidateQueries({ 
                queryKey: ["/api/leagues", selectedLeagueId, "matchups"] 
              })}
              disabled={!selectedLeagueId || !selectedWeek}
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
        <MatchupCard 
          data={matchupsData} 
          isLoading={matchupsLoading || !selectedLeagueId || !selectedWeek}
          leagueId={selectedLeagueId || ""}
          week={selectedWeek}
        />
      </main>
    </>
  );
}
