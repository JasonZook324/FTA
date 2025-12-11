import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";
import StandingsTable from "@/components/standings-table";
import { useAuth } from "@/hooks/use-auth";

export default function Standings() {
  const { user } = useAuth();

  // Query user leagues
  const { data: leagues } = useQuery({
    queryKey: ["/api/leagues"],
    enabled: !!user,
  });

  // Get the current league (first one in the list)
  const currentLeague = leagues && Array.isArray(leagues) && leagues.length > 0 ? leagues[0] : null;

  // Query standings data for current league
  const { data: standingsData, isLoading: standingsLoading } = useQuery({
    queryKey: ["/api/leagues", currentLeague?.id, "standings"],
    enabled: !!currentLeague?.id,
  });

  return (
    <>
      {/* Header Bar */}
      <header className="bg-card border-b border-border px-4 sm:px-6 py-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-foreground">League Standings</h2>
            <p className="text-sm text-muted-foreground">View team rankings and records</p>
          </div>
          {/* Local refresh removed; use header refresh instead */}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-auto p-4 sm:p-6">
        {!currentLeague ? (
          <Card className="h-96">
            <CardContent className="flex items-center justify-center h-full">
              <div className="text-center">
                <BarChart3 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No league loaded</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Please configure your ESPN credentials to view standings
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <StandingsTable 
            data={standingsData} 
            isLoading={standingsLoading}
            leagueId={currentLeague.id}
          />
        )}
      </main>
    </>
  );
}
