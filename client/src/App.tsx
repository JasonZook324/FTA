import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Authentication from "@/pages/authentication";
import Standings from "@/pages/standings";
import Rosters from "@/pages/rosters";
import Matchups from "@/pages/matchups";
import Players from "@/pages/players";
import AIRecommendations from "@/pages/ai-recommendations";
import TradeAnalyzer from "@/pages/trade-analyzer";
import Sidebar from "@/components/sidebar";
import LeagueHeader from "@/components/league-header";
import DebugPanel from "@/components/debug-panel";
import { TeamProvider } from "@/contexts/TeamContext";

function Router() {
  return (
    <>
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex-1 flex flex-col lg:ml-0">
          <LeagueHeader />
          <main className="flex-1 overflow-y-auto">
            <Switch>
              <Route path="/" component={Authentication} />
              <Route path="/authentication" component={Authentication} />
              <Route path="/standings" component={Standings} />
              <Route path="/rosters" component={Rosters} />
              <Route path="/matchups" component={Matchups} />
              <Route path="/players" component={Players} />
              <Route path="/ai-recommendations" component={AIRecommendations} />
              <Route path="/trade-analyzer" component={TradeAnalyzer} />
              <Route component={NotFound} />
            </Switch>
          </main>
        </div>
      </div>
      <DebugPanel />
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TeamProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </TeamProvider>
    </QueryClientProvider>
  );
}

export default App;
