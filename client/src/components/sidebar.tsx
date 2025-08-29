import { Link, useLocation } from "wouter";
import { Trophy, Key, BarChart3, Users, Calendar, UsersRound, Volleyball, Brain, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

const navigation = [
  { name: "Authentication", href: "/authentication", icon: Key },
  { name: "My Leagues", href: "/leagues", icon: Trophy },
  { name: "Standings", href: "/standings", icon: BarChart3 },
  { name: "Team Rosters", href: "/rosters", icon: Users },
  { name: "Matchups", href: "/matchups", icon: Calendar },
  { name: "Player Details", href: "/players", icon: UsersRound },
  { name: "AI Recommendations", href: "/ai-recommendations", icon: Brain },
  { name: "Trade Analyzer", href: "/trade-analyzer", icon: TrendingUp },
];

export default function Sidebar() {
  const [location] = useLocation();

  return (
    <div className="w-64 bg-card border-r border-border flex flex-col" data-testid="sidebar">
      {/* Logo and Header */}
      <div className="p-6 border-b border-border">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <Volleyball className="w-4 h-4 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">ESPN Fantasy</h1>
            <p className="text-xs text-muted-foreground">API Manager</p>
          </div>
        </div>
      </div>

      {/* Navigation Menu */}
      <nav className="flex-1 p-4" data-testid="navigation">
        <ul className="space-y-2">
          {navigation.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.href;
            
            return (
              <li key={item.name}>
                <Link href={item.href}>
                  <a
                    className={cn(
                      "flex items-center space-x-3 px-3 py-2 rounded-md transition-colors",
                      isActive 
                        ? "bg-primary text-primary-foreground" 
                        : "text-foreground hover:bg-secondary"
                    )}
                    data-testid={`nav-${item.name.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.name}</span>
                  </a>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* API Status */}
      <div className="p-4 border-t border-border">
        <div className="flex items-center space-x-2 text-sm">
          <div className="w-2 h-2 bg-chart-2 rounded-full"></div>
          <span className="text-muted-foreground">API Connected</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1" data-testid="connection-status">
          Ready for ESPN API calls
        </p>
      </div>
    </div>
  );
}
