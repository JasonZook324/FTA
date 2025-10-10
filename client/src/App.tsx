import { Switch, Route } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Authentication from "@/pages/authentication";
import Standings from "@/pages/standings";
import Rosters from "@/pages/rosters";
import Matchups from "@/pages/matchups";
import Players from "@/pages/players";
import AIRecommendations from "@/pages/ai-recommendations";
import AuthPage from "@/pages/auth-page";
import TradeAnalyzer from "@/pages/trade-analyzer";
import PromptBuilder from "@/pages/prompt-builder";
import Jobs from "@/pages/jobs";
import Streaming from "@/pages/streaming";
import ApiPlayground from "@/pages/api-playground";
import Sidebar from "@/components/sidebar";
import LeagueHeader from "@/components/league-header";
import DebugPanel from "@/components/debug-panel";
import { TeamProvider } from "@/contexts/TeamContext";
import { AuthProvider } from "@/hooks/use-auth";
import { ProtectedRoute } from "@/lib/protected-route";

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TeamProvider>
          <TooltipProvider>
            <Toaster />
            <Switch>
              {/* Public auth route */}
              <Route path="/auth" component={AuthPage} />
              
              {/* Protected routes with sidebar and header */}
              <ProtectedRoute path="/" component={() => (
                <div className="flex min-h-screen">
                  <Sidebar />
                  <div className="flex-1 flex flex-col lg:ml-0">
                    <LeagueHeader />
                    <main className="flex-1 overflow-y-auto">
                      <Authentication />
                    </main>
                  </div>
                </div>
              )} />
              
              <ProtectedRoute path="/authentication" component={() => (
                <div className="flex min-h-screen">
                  <Sidebar />
                  <div className="flex-1 flex flex-col lg:ml-0">
                    <LeagueHeader />
                    <main className="flex-1 overflow-y-auto">
                      <Authentication />
                    </main>
                  </div>
                </div>
              )} />
              
              <ProtectedRoute path="/standings" component={() => (
                <div className="flex min-h-screen">
                  <Sidebar />
                  <div className="flex-1 flex flex-col lg:ml-0">
                    <LeagueHeader />
                    <main className="flex-1 overflow-y-auto">
                      <Standings />
                    </main>
                  </div>
                </div>
              )} />
              
              <ProtectedRoute path="/rosters" component={() => (
                <div className="flex min-h-screen">
                  <Sidebar />
                  <div className="flex-1 flex flex-col lg:ml-0">
                    <LeagueHeader />
                    <main className="flex-1 overflow-y-auto">
                      <Rosters />
                    </main>
                  </div>
                </div>
              )} />
              
              <ProtectedRoute path="/matchups" component={() => (
                <div className="flex min-h-screen">
                  <Sidebar />
                  <div className="flex-1 flex flex-col lg:ml-0">
                    <LeagueHeader />
                    <main className="flex-1 overflow-y-auto">
                      <Matchups />
                    </main>
                  </div>
                </div>
              )} />
              
              <ProtectedRoute path="/players" component={() => (
                <div className="flex min-h-screen">
                  <Sidebar />
                  <div className="flex-1 flex flex-col lg:ml-0">
                    <LeagueHeader />
                    <main className="flex-1 overflow-y-auto">
                      <Players />
                    </main>
                  </div>
                </div>
              )} />

                <ProtectedRoute path="/jobs" component={() => (
                  <div className="flex min-h-screen">
                    <Sidebar />
                    <div className="flex-1 flex flex-col lg:ml-0">
                      <LeagueHeader />
                      <main className="flex-1 overflow-y-auto">
                        <Jobs />
                      </main>
                    </div>
                  </div>
                )} />

                  <ProtectedRoute path="/streaming" component={() => (
                    <div className="flex min-h-screen">
                      <Sidebar />
                      <div className="flex-1 flex flex-col lg:ml-0">
                        <LeagueHeader />
                        <main className="flex-1 overflow-y-auto">
                          <Streaming />
                        </main>
                      </div>
                    </div>
                  )} />
              
              <ProtectedRoute path="/ai-recommendations" component={() => (
                <div className="flex min-h-screen">
                  <Sidebar />
                  <div className="flex-1 flex flex-col lg:ml-0">
                    <LeagueHeader />
                    <main className="flex-1 overflow-y-auto">
                      <AIRecommendations />
                    </main>
                  </div>
                </div>
              )} />
              
              <ProtectedRoute path="/trade-analyzer" component={() => (
                <div className="flex min-h-screen">
                  <Sidebar />
                  <div className="flex-1 flex flex-col lg:ml-0">
                    <LeagueHeader />
                    <main className="flex-1 overflow-y-auto">
                      <TradeAnalyzer />
                    </main>
                  </div>
                </div>
              )} />
              
              <ProtectedRoute path="/prompt-builder" component={() => (
                <div className="flex min-h-screen">
                  <Sidebar />
                  <div className="flex-1 flex flex-col lg:ml-0">
                    <LeagueHeader />
                    <main className="flex-1 overflow-y-auto">
                      <PromptBuilder />
                    </main>
                  </div>
                </div>
              )} />
              
              <ProtectedRoute path="/api-playground" component={() => (
                <div className="flex min-h-screen">
                  <Sidebar />
                  <div className="flex-1 flex flex-col lg:ml-0">
                    <main className="flex-1 overflow-y-auto">
                      <ApiPlayground />
                    </main>
                  </div>
                </div>
              )} />
              
              <Route component={NotFound} />
            </Switch>
            <DebugPanel />
          </TooltipProvider>
        </TeamProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
