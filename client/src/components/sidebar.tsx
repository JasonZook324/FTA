import { Link, useLocation } from "wouter";
import { Trophy, Key, BarChart3, Users, Calendar, UsersRound, Volleyball, Brain, TrendingUp, Menu, X, FileText, Sun, Moon, LogOut, PlayCircle, FlaskConical, UserCog, TestTube, LifeBuoy, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

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

export const navigation = [
  { name: "League Setup", href: "/authentication", icon: Key },
  { name: "Standings", href: "/standings", icon: BarChart3 },
  { name: "Team Rosters", href: "/rosters", icon: Users },
  { name: "Matchups", href: "/matchups", icon: Calendar },
  { name: "Player Details", href: "/players", icon: UsersRound },
  { name: "AI Recommendations", href: "/ai-recommendations", icon: Brain },
  { name: "Trade Analyzer", href: "/trade-analyzer", icon: TrendingUp },
  { name: "AI Answers", href: "/ai-answers", icon: FileText },
  { name: "API Playground", href: "/api-playground", icon: FlaskConical },
  { name: "Jobs", href: "/jobs", icon: Volleyball },
  { name: "Streaming", href: "/streaming", icon: PlayCircle },
  { name: "OPRK Sandbox", href: "/oprk-sandbox", icon: TestTube, adminOnly: true },
  { name: "Manage Members", href: "/manage-members", icon: UserCog },
  { name: "Account Settings", href: "/account-settings", icon: UserCog },
  { name: "Help", href: "/help", icon: LifeBuoy },
];

export function filterNavigationForUser(user?: { role?: number } | null) {
  return navigation.filter((item) => {
    const adminOnlyPages = [
      "API Playground",
      "Jobs",
      "Matchups",
      "AI Recommendations",
      "Trade Analyzer",
      "Streaming",
    ];

    if (adminOnlyPages.includes(item.name)) {
      return user?.role === 9 || user?.role === 2;
    }

    if ((item as any).adminOnly) {
      return user?.role === 9 || user?.role === 2;
    }

    if (item.name === "Manage Members") {
      return user?.role === 9;
    }

    // Restrict AI Answers to paid or elevated roles
    if (item.name === "AI Answers") {
      return user?.role === 1 || user?.role === 2 || user?.role === 9;
    }

    return true;
  });
}

export default function Sidebar() {
  const [location] = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const { theme, toggleTheme } = useThemeSafe();
  const { user, logoutMutation } = useAuth();
  
  // Preload both logo images
  useEffect(() => {
    const lightImg = new Image();
    const darkImg = new Image();
    lightImg.src = '/logo_light.png';
    darkImg.src = '/logo_dark.png';
  }, []);
  
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
        "fixed lg:static inset-y-0 left-0 z-40 w-94 bg-card border-r border-border flex flex-col transition-transform duration-300 ease-in-out lg:translate-x-0 overflow-y-auto",
        isOpen ? "translate-x-0" : "-translate-x-full"
      )} data-testid="sidebar">
      {/* Logo, User, and Quick Actions in Header */}
      <div className="px-6 pt-6 pb-3 border-b border-border">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center space-x-3">
            <img 
              src={theme === 'light' ? '/logo_light.png' : '/logo_dark.png'}
              alt="Fantasy Toolbox AI Logo" 
              className="w-16 h-16 rounded-lg object-cover transition-opacity duration-150"
              key={theme}
            />
            <div>
              <h1 className="text-lg font-bold text-foreground">Fantasy Toolbox AI</h1>
              <p className="text-xs text-muted-foreground">Your Playbook Just Got Smarter</p>
            </div>
          </div>
          {/* Quick actions: theme only */}
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={toggleTheme}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-foreground hover:bg-accent hover:text-accent-foreground"
                  aria-label={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
                  data-testid="theme-toggle"
                >
                  {theme === 'light' ? (
                    <Moon className="w-5 h-5" />
                  ) : (
                    <Sun className="w-5 h-5" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{theme === 'light' ? 'Dark mode' : 'Light mode'}</TooltipContent>
            </Tooltip>
          </div>
        </div>
        {user && (
          <div className="mt-3">
            <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/40 px-2.5 py-1.5">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold">
                  {(user.username?.[0] || 'U').toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-medium text-foreground truncate max-w-[9rem]">{user.username}</span>
                    <span className={cn(
                      "text-[10px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap",
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
              </div>
              <div className="flex items-center gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link
                      href="/account-settings"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-foreground hover:bg-accent hover:text-accent-foreground"
                      aria-label="Account Settings"
                      onClick={() => setIsOpen(false)}
                      data-testid="button-account-settings"
                    >
                      <Settings className="w-4 h-4" />
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Account Settings</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={handleLogout}
                      disabled={logoutMutation.isPending}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-destructive hover:bg-destructive/10 disabled:opacity-50"
                      aria-label="Logout"
                      data-testid="button-logout"
                    >
                      <LogOut className="w-4 h-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">{logoutMutation.isPending ? 'Logging out…' : 'Logout'}</TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Navigation Menu */}
      <nav className="flex-1 p-4 overflow-y-auto" data-testid="navigation">
        <ul className="space-y-2">
          {filterNavigationForUser(user)
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
      {/* Bottom spacer only; user bar is under logo */}
      </div>
    </>
  );
}
