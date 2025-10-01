import { Link, useLocation } from "wouter";
import { Trophy, Key, BarChart3, Users, Calendar, UsersRound, Volleyball, Brain, TrendingUp, Menu, X, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

const navigation = [
  { name: "Fantasy Manager", href: "/authentication", icon: Key },
  { name: "Standings", href: "/standings", icon: BarChart3 },
  { name: "Team Rosters", href: "/rosters", icon: Users },
  { name: "Matchups", href: "/matchups", icon: Calendar },
  { name: "Player Details", href: "/players", icon: UsersRound },
  { name: "AI Recommendations", href: "/ai-recommendations", icon: Brain },
  { name: "Trade Analyzer", href: "/trade-analyzer", icon: TrendingUp },
  { name: "Prompt Builder", href: "/prompt-builder", icon: FileText },
];

export default function Sidebar() {
  const [location] = useLocation();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Mobile menu button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-card border border-border rounded-md shadow-lg"
        data-testid="mobile-menu-button"
      >
        {isOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setIsOpen(false)}
          data-testid="mobile-overlay"
        />
      )}

      {/* Sidebar */}
      <div className={cn(
        "fixed lg:static inset-y-0 left-0 z-40 w-64 bg-card border-r border-border flex flex-col transition-transform duration-300 ease-in-out lg:translate-x-0",
        isOpen ? "translate-x-0" : "-translate-x-full"
      )} data-testid="sidebar">
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
                <Link 
                  href={item.href}
                  className={cn(
                    "flex items-center space-x-3 px-3 py-3 rounded-md transition-colors touch-target", 
                    isActive 
                      ? "bg-primary text-primary-foreground" 
                      : "text-foreground hover:bg-secondary"
                  )}
                  data-testid={`nav-${item.name.toLowerCase().replace(/\s+/g, '-')}`}
                  onClick={() => setIsOpen(false)}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-sm">{item.name}</span>
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
    </>
  );
}
