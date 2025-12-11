import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import TeamRoster from "@/components/team-roster";
import { useAuth } from "@/hooks/use-auth";

export default function Rosters() {
  const { user } = useAuth();

  // Query user leagues
  const { data: leagues } = useQuery({
    queryKey: ["/api/leagues"],
    enabled: !!user,
  });

  // Auto-select the first (and only) league
  const selectedLeagueId = leagues?.[0]?.id;

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
            <p className="text-muted-foreground">
              {leagues?.[0] ? `${leagues[0].name} (${leagues[0].season}) - View team lineups and player details` : "View team lineups and player details"}
            </p>
          </div>
          {/* Local refresh removed; use header refresh instead */}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-auto p-6">
        <TeamRoster 
          data={rostersData} 
          isLoading={rostersLoading || !selectedLeagueId}
          leagueId={selectedLeagueId || ""}
        />
      </main>
    </>
  );
}
