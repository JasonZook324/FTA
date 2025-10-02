import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { apiRequest } from '@/lib/queryClient';
import { useQuery } from '@tanstack/react-query';
import type { User, League } from '@shared/schema';

interface SelectedTeam {
  teamId: number;
  teamName: string;
  leagueId: string;
}

interface TeamContextType {
  selectedTeam: SelectedTeam | null;
  setSelectedTeam: (team: SelectedTeam | null) => void;
}

const TeamContext = createContext<TeamContextType | undefined>(undefined);

export function TeamProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [selectedTeam, setSelectedTeamState] = useState<SelectedTeam | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Query the user's selected team from database
  const { data: userData } = useQuery<User>({
    queryKey: ['/api/user'],
    enabled: !!user,
  });

  // Query leagues to get team name
  const { data: leagues } = useQuery<League[]>({
    queryKey: ['/api/leagues'],
    enabled: !!user,
  });

  // Initialize selected team from database or localStorage
  useEffect(() => {
    if (!user || isInitialized) return;

    // First try to get from database (user record)
    if (userData && userData.selectedTeamId && userData.selectedLeagueId && leagues) {
      const league = leagues.find((l: any) => l.id === userData.selectedLeagueId);
      if (league) {
        // Fetch teams for this league to get team name
        fetch(`/api/leagues/${league.id}/standings`, {
          credentials: 'include'
        })
          .then(res => res.json())
          .then(data => {
            if (data.teams) {
              const team = data.teams.find((t: any) => t.id === userData.selectedTeamId);
              if (team) {
                const teamName = team.location && team.nickname
                  ? `${team.location} ${team.nickname}`
                  : team.name || `Team ${team.id}`;
                
                if (userData.selectedTeamId && userData.selectedLeagueId) {
                  setSelectedTeamState({
                    teamId: userData.selectedTeamId,
                    teamName,
                    leagueId: userData.selectedLeagueId
                  });
                }
                setIsInitialized(true);
              }
            }
          })
          .catch(err => {
            console.error('Failed to fetch team name:', err);
            // Fall back to localStorage
            loadFromLocalStorage();
          });
      } else {
        // League not found, fall back to localStorage
        loadFromLocalStorage();
      }
    } else {
      // No database selection, try localStorage
      loadFromLocalStorage();
    }

    function loadFromLocalStorage() {
      if (typeof window !== 'undefined') {
        const stored = localStorage.getItem('selectedTeam');
        if (stored) {
          try {
            setSelectedTeamState(JSON.parse(stored));
          } catch (error) {
            console.error('Failed to parse stored team:', error);
            localStorage.removeItem('selectedTeam');
          }
        }
      }
      setIsInitialized(true);
    }
  }, [userData, leagues, user, isInitialized]);

  const setSelectedTeam = async (team: SelectedTeam | null) => {
    setSelectedTeamState(team);
    
    // Save to localStorage
    if (typeof window !== 'undefined') {
      if (team) {
        localStorage.setItem('selectedTeam', JSON.stringify(team));
      } else {
        localStorage.removeItem('selectedTeam');
      }
    }

    // Save to database if user is logged in
    if (user && team) {
      try {
        await apiRequest('PUT', '/api/user/selected-team', {
          teamId: team.teamId,
          leagueId: team.leagueId
        });
      } catch (error) {
        console.error('Failed to save selected team to database:', error);
      }
    }
  };

  return (
    <TeamContext.Provider value={{ selectedTeam, setSelectedTeam }}>
      {children}
    </TeamContext.Provider>
  );
}

export function useTeam() {
  const context = useContext(TeamContext);
  if (context === undefined) {
    throw new Error('useTeam must be used within a TeamProvider');
  }
  return context;
}
