import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw, BarChart3 } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import StandingsTable from "@/components/standings-table";

export default function Standings() {
  const [userId] = useState("default-user");

  // Query user leagues
  const { data: leagues } = useQuery({
    queryKey: ["/api/leagues", userId],
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
      <header className="bg-card border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">League Standings</h2>
            <p className="text-muted-foreground">View team rankings and records</p>
          </div>
          {/*<div className="flex items-center space-x-3">*/}
          {/*  <Button*/}
          {/*    variant="secondary"*/}
          {/*    onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/leagues", currentLeague?.id, "standings"] })}*/}
          {/*    disabled={!currentLeague}*/}
          {/*    data-testid="button-refresh"*/}
          {/*  >*/}
          {/*    <RefreshCw className="w-4 h-4 mr-2" />*/}
          {/*    Refresh*/}
          {/*  </Button>*/}
          {/*</div>*/}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-auto p-6">
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
