import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

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
  const [selectedTeam, setSelectedTeamState] = useState<SelectedTeam | null>(null);

  // Load from localStorage after mount (client-side only)
  useEffect(() => {
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
  }, []);

  const setSelectedTeam = (team: SelectedTeam | null) => {
    setSelectedTeamState(team);
    if (typeof window !== 'undefined') {
      if (team) {
        localStorage.setItem('selectedTeam', JSON.stringify(team));
      } else {
        localStorage.removeItem('selectedTeam');
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
