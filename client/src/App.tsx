import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Authentication from "@/pages/authentication";
import Leagues from "@/pages/leagues";
import Standings from "@/pages/standings";
import Rosters from "@/pages/rosters";
import Matchups from "@/pages/matchups";
import Players from "@/pages/players";
import AIRecommendations from "@/pages/ai-recommendations";
import Sidebar from "@/components/sidebar";

function Router() {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Switch>
          <Route path="/" component={Authentication} />
          <Route path="/authentication" component={Authentication} />
          <Route path="/leagues" component={Leagues} />
          <Route path="/standings" component={Standings} />
          <Route path="/rosters" component={Rosters} />
          <Route path="/matchups" component={Matchups} />
          <Route path="/players" component={Players} />
          <Route path="/ai-recommendations" component={AIRecommendations} />
          <Route component={NotFound} />
        </Switch>
      </div>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
