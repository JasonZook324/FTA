import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

interface League {
  id: string;
  name: string;
  season: number;
  sport: string;
}

interface SelectedLeagueResponse {
  selectedLeague: League | null;
}

export function useSelectedLeague(userId: string) {
  const [selectedLeagueId, setSelectedLeagueId] = useState<string>("");

  // Query user's selected league from backend
  const { data: selectedLeagueData } = useQuery<SelectedLeagueResponse>({
    queryKey: ["/api/user", userId, "selected-league"],
    enabled: !!userId,
  });

  // Query all user leagues
  const { data: leagues } = useQuery<League[]>({
    queryKey: ["/api/leagues", userId],
    enabled: !!userId,
  });

  // Auto-set the selected league when data loads
  useEffect(() => {
    if (selectedLeagueData?.selectedLeague?.id) {
      // Use the stored selected league
      setSelectedLeagueId(selectedLeagueData.selectedLeague.id);
    } else if (leagues && leagues.length > 0 && !selectedLeagueId) {
      // If no stored selection, use the first available league
      setSelectedLeagueId(leagues[0].id);
    }
  }, [selectedLeagueData, leagues, selectedLeagueId]);

  return {
    selectedLeagueId,
    setSelectedLeagueId,
    selectedLeague: selectedLeagueData?.selectedLeague,
    leagues: leagues || [],
    hasAutoSelected: !!selectedLeagueData?.selectedLeague?.id
  };
}