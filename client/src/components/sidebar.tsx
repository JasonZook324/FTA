import { Link, useLocation } from "wouter";
import { Trophy, Key, BarChart3, Users, Calendar, UsersRound, Volleyball, Brain, TrendingUp, Menu, X, FileText, Sun, Moon, LogOut, PlayCircle, FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";

// Safe theme hook with fallback
const useThemeSafe = () => {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      const saved = localStorage.getItem('theme');
      if (saved === 'dark' || saved === 'light') {
        return saved;
      }
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });
  
  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    try {
      localStorage.setItem('theme', newTheme);
      document.documentElement.classList.remove('light', 'dark');
      document.documentElement.classList.add(newTheme);
      
      // Update meta theme-color for mobile browsers
      const metaThemeColor = document.querySelector('meta[name="theme-color"]');
      if (metaThemeColor) {
        const color = newTheme === 'dark' ? '#0f172a' : '#ffffff';
        metaThemeColor.setAttribute('content', color);
      }
    } catch (error) {
      console.warn('Failed to save theme:', error);
    }
  };
  
  // Apply theme on mount and changes
  useEffect(() => {
    try {
      document.documentElement.classList.remove('light', 'dark');
      document.documentElement.classList.add(theme);
    } catch (error) {
      console.warn('Failed to apply theme:', error);
    }
  }, [theme]);
  
  return { theme, toggleTheme };
};

const navigation = [
  { name: "Fantasy Manager", href: "/authentication", icon: Key },
  { name: "Standings", href: "/standings", icon: BarChart3 },
  { name: "Team Rosters", href: "/rosters", icon: Users },
  { name: "Matchups", href: "/matchups", icon: Calendar },
  { name: "Player Details", href: "/players", icon: UsersRound },
  { name: "AI Recommendations", href: "/ai-recommendations", icon: Brain },
  { name: "Trade Analyzer", href: "/trade-analyzer", icon: TrendingUp },
  { name: "Prompt Builder", href: "/prompt-builder", icon: FileText },
  { name: "API Playground", href: "/api-playground", icon: FlaskConical },
  { name: "Jobs", href: "/jobs", icon: Volleyball },
  { name: "Streaming", href: "/streaming", icon: PlayCircle },
];

export default function Sidebar() {
  const [location] = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const { theme, toggleTheme } = useThemeSafe();
  const { user, logoutMutation } = useAuth();
  
  const handleLogout = () => {
    logoutMutation.mutate();
    setIsOpen(false);
  };

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
        "fixed lg:static inset-y-0 left-0 z-40 w-64 bg-card border-r border-border flex flex-col transition-transform duration-300 ease-in-out lg:translate-x-0 overflow-y-auto",
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
      <nav className="flex-1 p-4 overflow-y-auto" data-testid="navigation">
        <ul className="space-y-2">
          {navigation
            .filter((item) => {
              // Hide admin-only pages for non-admin/developer users
              const adminOnlyPages = ['API Playground', 'Jobs', 'Matchups'];
              if (adminOnlyPages.includes(item.name)) {
                // Allow access for Admin (role 9) or Developer (role 2)
                return user?.role === 9 || user?.role === 2;
              }
              return true;
            })
            .map((item) => {
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
                        : "text-foreground hover:bg-accent hover:text-accent-foreground"
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

      {/* API Status and Actions */}
      <div className="p-4 border-t border-border">
        {/* User Info */}
        {user && (
          <div className="mb-4 p-3 bg-accent rounded-md">
            <p className="text-xs text-muted-foreground mb-1">Logged in as</p>
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground truncate">{user.username}</p>
              {/* Role Badge */}
              <span className={cn(
                "text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ml-2",
                user.role === 9 ? "bg-purple-500/20 text-purple-700 dark:text-purple-300" :
                user.role === 2 ? "bg-blue-500/20 text-blue-700 dark:text-blue-300" :
                user.role === 1 ? "bg-green-500/20 text-green-700 dark:text-green-300" :
                "bg-gray-500/20 text-gray-700 dark:text-gray-300"
              )}>
                {user.role === 9 ? "Admin" :
                 user.role === 2 ? "Dev" :
                 user.role === 1 ? "Paid" :
                 "User"}
              </span>
            </div>
          </div>
        )}
        
        {/* Theme Toggle */}
        <div className="mb-2">
          <button
            onClick={toggleTheme}
            className="flex items-center space-x-3 px-3 py-3 rounded-md transition-colors touch-target w-full text-foreground hover:bg-accent hover:text-accent-foreground"
            data-testid="theme-toggle"
          >
            {theme === 'light' ? (
              <Moon className="w-5 h-5" />
            ) : (
              <Sun className="w-5 h-5" />
            )}
            <span className="text-sm">
              {theme === 'light' ? 'Dark Mode' : 'Light Mode'}
            </span>
          </button>
        </div>
        
        {/* Logout Button */}
        <div className="mb-4">
          <button
            onClick={handleLogout}
            disabled={logoutMutation.isPending}
            className="flex items-center space-x-3 px-3 py-3 rounded-md transition-colors touch-target w-full text-destructive hover:bg-destructive/10 disabled:opacity-50"
            data-testid="button-logout"
          >
            <LogOut className="w-5 h-5" />
            <span className="text-sm">
              {logoutMutation.isPending ? 'Logging out...' : 'Logout'}
            </span>
          </button>
        </div>
        
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
