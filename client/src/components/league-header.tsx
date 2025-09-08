import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trophy, LogOut, Settings, AlertTriangle } from "lucide-react";

export default function LeagueHeader() {
  const { toast } = useToast();
  const [userId] = useState("default-user");

  // Query current leagues
  const { data: leagues, isLoading: leaguesLoading } = useQuery({
    queryKey: ["/api/leagues", userId],
  });

  // Query authentication status
  const { data: credentials } = useQuery({
    queryKey: ["/api/espn-credentials", userId],
  });

  // Disconnect mutation
  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("DELETE", `/api/espn-credentials/${userId}`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Disconnected",
        description: "Successfully disconnected from ESPN account and cleared all data",
      });
      queryClient.clear();
    },
    onError: (error: Error) => {
      toast({
        title: "Disconnect Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const currentLeague = leagues && Array.isArray(leagues) && leagues.length > 0 ? leagues[0] : null;

  if (leaguesLoading) {
    return (
      <div className="bg-card border-b border-border px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-2 bg-muted rounded animate-pulse"></div>
            <div className="w-32 h-4 bg-muted rounded animate-pulse"></div>
          </div>
          <div className="w-20 h-8 bg-muted rounded animate-pulse"></div>
        </div>
      </div>
    );
  }

  // No league loaded - show authentication prompt
  if (!currentLeague) {
    return (
      <div className="bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-950 dark:to-amber-950 border-b border-orange-200 dark:border-orange-800 px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <AlertTriangle className="w-5 h-5 text-orange-600 dark:text-orange-400" />
            <div>
              <span className="text-sm font-medium text-orange-800 dark:text-orange-200">No League Connected</span>
              <p className="text-xs text-orange-600 dark:text-orange-400">Configure your ESPN credentials to get started</p>
            </div>
          </div>
          <Link href="/authentication">
            <Button variant="outline" size="sm" className="border-orange-300 text-orange-700 hover:bg-orange-100 dark:border-orange-600 dark:text-orange-300 dark:hover:bg-orange-900">
              <Settings className="w-4 h-4 mr-2" />
              Setup Authentication
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // League loaded - show league info with disconnect option
  return (
    <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950 dark:to-emerald-950 border-b border-green-200 dark:border-green-800 px-6 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Trophy className="w-5 h-5 text-green-600 dark:text-green-400" />
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-semibold text-green-800 dark:text-green-200">{currentLeague.name}</span>
              <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100">
                {currentLeague.sport.toUpperCase()}
              </Badge>
            </div>
            <div className="flex items-center space-x-4 text-xs text-green-600 dark:text-green-400">
              <span>Season {currentLeague.season}</span>
              <span>•</span>
              <span>{currentLeague.teamCount} teams</span>
              <span>•</span>
              <span>Week {currentLeague.currentWeek}</span>
            </div>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => disconnectMutation.mutate()}
          disabled={disconnectMutation.isPending}
          className="border-green-300 text-green-700 hover:bg-green-100 dark:border-green-600 dark:text-green-300 dark:hover:bg-green-900"
          data-testid="button-disconnect-header"
        >
          <LogOut className="w-4 h-4 mr-2" />
          {disconnectMutation.isPending ? "Disconnecting..." : "Disconnect"}
        </Button>
      </div>
    </div>
  );
}