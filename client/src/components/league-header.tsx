import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trophy, LogOut, Settings, AlertTriangle, RefreshCw, Users } from "lucide-react";
import { useTeam } from "@/contexts/TeamContext";
import { useAuth } from "@/hooks/use-auth";

export default function LeagueHeader() {
  const { toast } = useToast();
  const { selectedTeam, setSelectedTeam } = useTeam();
  const { user } = useAuth();

  // Query current leagues
  const { data: leagues, isLoading: leaguesLoading } = useQuery({
    queryKey: ["/api/leagues"],
    enabled: !!user,
  });

  // Query league profiles (shareable leagues)
  const { data: leagueProfiles, isLoading: profilesLoading } = useQuery({
    queryKey: ["/api/leagues/available"],
    enabled: !!user,
  });

  // Filter league profiles to only show ones user has joined
  const memberLeagues = leagueProfiles && Array.isArray(leagueProfiles) 
    ? leagueProfiles.filter((profile: any) => profile.isMember) 
    : [];

  // Prefer personal leagues, fall back to member league profiles
  const currentLeague = leagues && Array.isArray(leagues) && leagues.length > 0 
    ? leagues[0] 
    : (memberLeagues.length > 0 ? memberLeagues[0] : null);

  // Query teams for the current league (use standings endpoint to get properly formatted team names)
  const { data: teamsData, isLoading: isLoadingTeams } = useQuery<{ teams?: any[] }>({
    queryKey: ["/api/leagues", currentLeague?.id, "standings"],
    enabled: !!currentLeague?.id,
  });

  // Reload league data mutation
  const reloadLeagueMutation = useMutation({
    mutationFn: async () => {
      if (!currentLeague) {
        throw new Error("No league selected");
      }
      const response = await apiRequest("POST", `/api/espn-credentials/reload-league`, {
        espnLeagueId: currentLeague.espnLeagueId,
        season: currentLeague.season
      });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Success",
        description: `League data refreshed! "${data.league.name}" now has ${data.league.teamCount} teams with updated information.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues/available"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Refresh Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Disconnect mutation (leave league)
  const disconnectMutation = useMutation({
    mutationFn: async () => {
      if (!currentLeague) {
        throw new Error("No league selected");
      }
      const response = await apiRequest("DELETE", `/api/leagues/${currentLeague.id}/leave`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Left League",
        description: "Successfully left the league",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues/available"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Leave Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Helper function to get team name
  const getTeamName = (team: any) => {
    if (team.location && team.nickname) {
      return `${team.location} ${team.nickname}`;
    } else if (team.name) {
      return team.name;
    } else if (team.owners && team.owners[0]?.displayName) {
      return `${team.owners[0].displayName}'s Team`;
    }
    return `Team ${team.id}`;
  };

  // Handle team selection
  const handleTeamSelect = (teamId: string) => {
    const team = teamsData?.teams?.find((t: any) => t.id.toString() === teamId);
    if (team && currentLeague) {
      const teamName = getTeamName(team);
      setSelectedTeam({
        teamId: team.id,
        teamName,
        leagueId: currentLeague.id
      });
      toast({
        title: "Team Selected",
        description: `You are now managing "${teamName}"`,
      });
    }
  };

  if (leaguesLoading || profilesLoading) {
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
      <div className="bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-950 dark:to-amber-950 border-b border-orange-200 dark:border-orange-800 px-4 sm:px-6 py-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:justify-between">
          <div className="flex items-center space-x-3">
            <AlertTriangle className="w-5 h-5 text-orange-600 dark:text-orange-400 flex-shrink-0" />
            <div>
              <span className="text-sm font-medium text-orange-800 dark:text-orange-200">No League Connected</span>
              <p className="text-xs text-orange-600 dark:text-orange-400">Configure your ESPN credentials to get started</p>
            </div>
          </div>
          <Link href="/authentication" className="w-full sm:w-auto">
            <Button variant="outline" className="w-full sm:w-auto min-h-[44px] border-orange-300 text-orange-700 hover:bg-orange-100 dark:border-orange-600 dark:text-orange-300 dark:hover:bg-orange-900">
              <Settings className="w-4 h-4 mr-2" />
              Setup Authentication
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // League loaded - show league info with team selector and disconnect option
  return (
    <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950 dark:to-emerald-950 border-b border-green-200 dark:border-green-800 px-4 sm:px-6 py-3">
      <div className="flex flex-col lg:flex-row items-start lg:items-center gap-3 lg:justify-between">
        <div className="flex items-center space-x-3 sm:space-x-4 flex-1 min-w-0">
          <Trophy className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center flex-wrap gap-2">
              <span className="font-semibold text-green-800 dark:text-green-200 text-sm sm:text-base truncate">{currentLeague.name}</span>
              <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100 flex-shrink-0">
                {currentLeague.sport.toUpperCase()}
              </Badge>
            </div>
            <div className="flex items-center flex-wrap gap-x-2 gap-y-1 text-xs text-green-600 dark:text-green-400 mt-1">
              <span className="whitespace-nowrap">Season {currentLeague.season}</span>
              <span className="hidden sm:inline">•</span>
              <span className="whitespace-nowrap">{currentLeague.teamCount} teams</span>
              <span className="hidden sm:inline">•</span>
              <span className="whitespace-nowrap">Week {currentLeague.currentWeek}</span>
            </div>
          </div>
          
          {/* Team Selector */}
          <div className="flex items-center gap-2 min-w-[200px]">
            <Users className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" />
            <Select
              value={selectedTeam?.teamId?.toString() || ""}
              onValueChange={handleTeamSelect}
              disabled={isLoadingTeams || !teamsData?.teams?.length}
            >
              <SelectTrigger 
                className="h-9 bg-white dark:bg-gray-900 border-green-300 dark:border-green-700 text-green-800 dark:text-green-200"
                data-testid="select-team-header"
              >
                <SelectValue placeholder={
                  isLoadingTeams 
                    ? "Loading teams..." 
                    : !teamsData?.teams?.length 
                      ? "No teams found" 
                      : "Select your team"
                } />
              </SelectTrigger>
              <SelectContent>
                {teamsData?.teams?.map((team: any) => {
                  const teamName = getTeamName(team);
                  return (
                    <SelectItem key={team.id} value={team.id.toString()}>
                      {teamName}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        </div>
        
        <div className="flex items-center gap-2 w-full lg:w-auto">
          <Button
            variant="outline"
            onClick={() => reloadLeagueMutation.mutate()}
            disabled={reloadLeagueMutation.isPending}
            className="flex-1 lg:flex-initial min-h-[44px] border-green-300 text-green-700 hover:bg-green-100 dark:border-green-600 dark:text-green-300 dark:hover:bg-green-900"
            data-testid="button-refresh-header"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            <span className="hidden sm:inline">{reloadLeagueMutation.isPending ? "Refreshing..." : "Refresh Data"}</span>
            <span className="sm:hidden">{reloadLeagueMutation.isPending ? "..." : "Refresh"}</span>
          </Button>
          <Button
            variant="outline"
            onClick={() => disconnectMutation.mutate()}
            disabled={disconnectMutation.isPending}
            className="flex-1 lg:flex-initial min-h-[44px] border-green-300 text-green-700 hover:bg-green-100 dark:border-green-600 dark:text-green-300 dark:hover:bg-green-900"
            data-testid="button-disconnect-header"
          >
            <LogOut className="w-4 h-4 mr-2" />
            <span className="hidden sm:inline">{disconnectMutation.isPending ? "Disconnecting..." : "Disconnect"}</span>
            <span className="sm:hidden">Exit</span>
          </Button>
        </div>
      </div>
    </div>
  );
}