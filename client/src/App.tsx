import { Switch, Route } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Authentication from "@/pages/authentication";
import Standings from "@/pages/standings";
import Rosters from "@/pages/rosters";
import Players from "@/pages/players";
import AuthPage from "@/pages/auth-page";
import AiAnswers from "@/pages/ai-answers";
import Help from "@/pages/help";
import Jobs from "@/pages/jobs";
import Streaming from "@/pages/streaming";
import ApiPlayground from "@/pages/api-playground";
import VerifyEmailPage from "@/pages/verify-email";
import ResetPasswordPage from "@/pages/reset-password";
import ManageMembers from "@/pages/manage-members";
import OPRKSandbox from "@/pages/oprk-sandbox";
import AccountSettings from "@/pages/account-settings";
import Sidebar from "@/components/sidebar";
import LeagueHeader from "@/components/league-header";
import DebugPanel from "@/components/debug-panel";
import Footer from "@/components/footer";
import { TeamProvider } from "@/contexts/TeamContext";
import { AuthProvider } from "@/hooks/use-auth";
import { ProtectedRoute } from "@/lib/protected-route";
import { AdminRoute } from "@/lib/admin-route";
import About from "@/pages/about";
import Contact from "@/pages/contact";
// Leagues page removed

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
              
              {/* Public email verification route */}
              <Route path="/verify-email" component={VerifyEmailPage} />
              
              {/* Public password reset route */}
              <Route path="/reset-password" component={ResetPasswordPage} />

              {/* Public About route with standard layout */}
              <Route path="/about" component={() => (
                <div className="flex min-h-screen">
                  <Sidebar />
                  <div className="flex-1 flex flex-col lg:ml-0">
                    <LeagueHeader />
                    <main className="flex-1 overflow-y-auto">
                      <About />
                    </main>
                  </div>
                </div>
              )} />

              {/* Public Contact route with standard layout */}
              <Route path="/contact" component={() => (
                <div className="flex min-h-screen">
                  <Sidebar />
                  <div className="flex-1 flex flex-col lg:ml-0">
                    <LeagueHeader />
                    <main className="flex-1 overflow-y-auto">
                      <Contact />
                    </main>
                  </div>
                </div>
              )} />
              
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
              
              {/* /leagues route removed */}
              
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

                <AdminRoute path="/jobs" component={() => (
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

                  <AdminRoute path="/streaming" component={() => (
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
              
              
              
              <ProtectedRoute path="/ai-answers" component={() => (
                <div className="flex min-h-screen">
                  <Sidebar />
                  <div className="flex-1 flex flex-col lg:ml-0">
                    <LeagueHeader />
                    <main className="flex-1 overflow-y-auto">
                      <AiAnswers />
                    </main>
                  </div>
                </div>
              )} />

              <ProtectedRoute path="/help" component={() => (
                <div className="flex min-h-screen">
                  <Sidebar />
                  <div className="flex-1 flex flex-col lg:ml-0">
                    <LeagueHeader />
                    <main className="flex-1 overflow-y-auto">
                      <Help />
                    </main>
                  </div>
                </div>
              )} />

              <ProtectedRoute path="/account-settings" component={() => (
                <div className="flex min-h-screen">
                  <Sidebar />
                  <div className="flex-1 flex flex-col lg:ml-0">
                    <LeagueHeader />
                    <main className="flex-1 overflow-y-auto">
                      <AccountSettings />
                    </main>
                  </div>
                </div>
              )} />

              
              
              <AdminRoute path="/api-playground" component={() => (
                <div className="flex min-h-screen">
                  <Sidebar />
                  <div className="flex-1 flex flex-col lg:ml-0">
                    <main className="flex-1 overflow-y-auto">
                      <ApiPlayground />
                    </main>
                  </div>
                </div>
              )} />
              
              <AdminRoute path="/manage-members" adminOnly={true} component={() => (
                <div className="flex min-h-screen">
                  <Sidebar />
                  <div className="flex-1 flex flex-col lg:ml-0">
                    <main className="flex-1 overflow-y-auto">
                      <ManageMembers />
                    </main>
                  </div>
                </div>
              )} />

              <AdminRoute path="/oprk-sandbox" component={() => (
                <div className="flex min-h-screen">
                  <Sidebar />
                  <div className="flex-1 flex flex-col lg:ml-0">
                    <LeagueHeader />
                    <main className="flex-1 overflow-y-auto">
                      <OPRKSandbox />
                    </main>
                  </div>
                </div>
              )} />
              
              <Route component={NotFound} />
            </Switch>
            <Footer />
            <DebugPanel />
          </TooltipProvider>
        </TeamProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
