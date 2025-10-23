
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useTeam } from "@/contexts/TeamContext";

export default function Streaming() {
  const { user } = useAuth();
  const { selectedTeam: contextSelectedTeam } = useTeam();
  const { data: leagues } = useQuery({
    queryKey: ["/api/leagues"],
    enabled: !!user,
  });
  const selectedLeagueId = Array.isArray(leagues) && leagues.length > 0 ? leagues[0].id : "";
  const { data: rostersDataRaw, isLoading: rostersLoading } = useQuery({
    queryKey: ["/api/leagues", selectedLeagueId, "rosters"],
    enabled: !!selectedLeagueId,
  });
  const rostersData = rostersDataRaw && typeof rostersDataRaw === "object" && "teams" in rostersDataRaw
    ? rostersDataRaw as { teams?: any[] }
    : { teams: [] };

  const teams = Array.isArray(rostersData.teams)
    ? rostersData.teams.map((team: any) => ({
        id: team.id,
        name: team.location && team.nickname ? `${team.location} ${team.nickname}` : team.name || `Team ${team.id}`
      }))
    : [];

  const playersByTeam: Record<string, { id: string; name: string }[]> = {};
  if (Array.isArray(rostersData.teams)) {
    rostersData.teams.forEach((team: any) => {
      playersByTeam[team.id] = Array.isArray(team.roster?.entries)
        ? team.roster.entries.map((entry: any) => {
            const player = entry.playerPoolEntry?.player;
            // Always show the true position, regardless of slot
            let positionName = "";
            const validPositions = ["QB", "RB", "WR", "TE", "K", "D/ST"];
            // Try eligiblePositions array first (ESPN true positions)
            if (Array.isArray(player?.eligiblePositions) && player.eligiblePositions.length > 0) {
              for (const posId of player.eligiblePositions) {
                const posName = getPositionName(posId);
                if (validPositions.includes(posName)) {
                  positionName = posName;
                  break;
                }
              }
            }
            // Only use defaultPositionId if it is a valid football position
            if (!positionName && typeof player?.defaultPositionId === "number") {
              const posName = getPositionName(player.defaultPositionId);
              if (validPositions.includes(posName)) {
                positionName = posName;
              }
            }
            // Do NOT use any fallback if not found
            return {
              id: player?.id,
              name: (player?.fullName || "Unknown Player") + (positionName ? ` (${positionName})` : ""),
              positionId: player?.defaultPositionId
            };
          })
        : [];
    });
  }

  // Helper to get position name from ESPN position ID
  function getPositionName(positionId: number | undefined): string {
    const positions: Record<number, string> = {
      0: "QB", 1: "QB", 2: "RB", 3: "WR", 4: "WR", 5: "K", 6: "TE", 16: "D/ST", 17: "K", 20: "Bench", 21: "I.R.", 23: "FLEX", 7: "OP", 10: "UTIL", 12: "RB/WR/TE"
    };
    return positionId !== undefined ? positions[positionId] || "" : "";
  }

  const [selectedTeam, setSelectedTeam] = useState<string>("");
  const [selectedPlayer, setSelectedPlayer] = useState<string>("");

  // Only auto-select on initial load
  useEffect(() => {
    if (teams.length > 0 && selectedTeam === "") {
      const contextTeamId = contextSelectedTeam?.teamId?.toString();
      const foundTeam = teams.find((t: { id: string | number }) => t.id.toString() === contextTeamId);
      const autoTeamId = foundTeam ? foundTeam.id.toString() : teams[0].id.toString();
      setSelectedTeam(autoTeamId);
      setSelectedPlayer(playersByTeam[autoTeamId]?.[0]?.id || "");
    }
  }, [teams, contextSelectedTeam, playersByTeam, selectedTeam]);

  const handleTeamChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const teamId = e.target.value;
    setSelectedTeam(teamId);
    setSelectedPlayer(playersByTeam[teamId]?.[0]?.id || "");
  };

  return (
    <div className="max-w-xl mx-auto p-8">
      <h2 className="text-2xl font-bold mb-6">Streaming Options</h2>
      <div className="mb-4">
        <label className="block mb-2 font-medium">Select Team</label>
        <select
          className="w-full p-2 border rounded bg-background text-foreground"
          value={selectedTeam}
          onChange={handleTeamChange}
          disabled={teams.length === 0}
        >
          {teams.map((team: { id: string; name: string }) => (
            <option key={team.id} value={team.id}>{team.name}</option>
          ))}
        </select>
      </div>
      <div className="mb-4">
        <label className="block mb-2 font-medium">Select Player</label>
        <select
          className="w-full p-2 border rounded bg-background text-foreground"
          value={selectedPlayer}
          onChange={e => setSelectedPlayer(e.target.value)}
          disabled={playersByTeam[selectedTeam]?.length === 0}
        >
          {(playersByTeam[selectedTeam] || []).map((player: { id: string; name: string }) => (
            <option key={player.id} value={player.id}>{player.name}</option>
          ))}
        </select>
      </div>
      <button
        className="bg-primary text-white px-4 py-2 rounded shadow hover:bg-primary-dark"
        onClick={() => {}}
      >
        Streaming Options
      </button>
    </div>
  );
}
