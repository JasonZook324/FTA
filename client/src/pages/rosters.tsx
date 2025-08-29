import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { RefreshCw, Users } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import TeamRoster from "@/components/team-roster";

export default function Rosters() {
  const [userId] = useState("default-user");
  const [selectedLeagueId, setSelectedLeagueId] = useState<string>("");

  // Query user leagues
  const { data: leagues } = useQuery({
    queryKey: ["/api/leagues", userId],
  });

  // Query rosters data
  const { data: rostersData, isLoading: rostersLoading } = useQuery({
    queryKey: ["/api/leagues", selectedLeagueId, "rosters"],
    enabled: !!selectedLeagueId,
  });

  return (
    <>
      {/* Header Bar */}
      <header className="bg-card border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Team Rosters</h2>
            <p className="text-muted-foreground">View team lineups and player details</p>
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
            <Button
              variant="secondary"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/leagues", selectedLeagueId, "rosters"] })}
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
                <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">Select a league to view team rosters</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <TeamRoster 
            data={rostersData} 
            isLoading={rostersLoading}
            leagueId={selectedLeagueId}
          />
        )}
      </main>
    </>
  );
}
