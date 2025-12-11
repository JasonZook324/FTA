import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { LifeBuoy, BookOpenText, Wrench, MessageCircleQuestion, Settings, Users, BarChart3, Search, Brain, TrendingUp, PlayCircle } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export default function Help() {
  const { user } = useAuth();
  const isAdminOrDev = user?.role === 9 || user?.role === 2;
  const isPaid = user?.role === 1;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <header className="mb-6 flex items-center gap-3">
        <LifeBuoy className="w-7 h-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Help Center</h1>
          <p className="text-sm text-muted-foreground">Documentation, guides, and FAQs for Fantasy Toolbox AI</p>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <BookOpenText className="w-5 h-5" />
              <CardTitle>Documentation</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <p className="text-muted-foreground">Explore core features available to all signed-in users:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <Link href="/authentication" className="text-primary hover:underline">League Setup</Link> — connect your ESPN league.
              </li>
              <li>
                <Link href="/standings" className="text-primary hover:underline">Standings</Link> — view league table and trends.
              </li>
              <li>
                <Link href="/players" className="text-primary hover:underline">Player Details</Link> — search players and stats.
              </li>
              <li>
                <Link href="/rosters" className="text-primary hover:underline">Team Rosters</Link> — see rosters and positions.
              </li>
            </ul>

            {(isPaid || isAdminOrDev) && (
              <>
                <p className="text-muted-foreground mt-4">Additional features available to your account:</p>
                <ul className="list-disc pl-5 space-y-1">
                  {/* AI Answers is available to paid/admin/dev users */}
                  <li>
                    <Link href="/ai-answers" className="text-primary hover:underline">AI Answers</Link> — ask AI about your league using grounded data.
                  </li>
                </ul>
              </>
            )}

            {isAdminOrDev && (
              <>
                <p className="text-muted-foreground mt-4">Admin/Developer features:</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>
                    <Link href="/trade-analyzer" className="text-primary hover:underline">Trade Analyzer</Link> — analyze multi-player trades.
                  </li>
                  <li>
                    <Link href="/streaming" className="text-primary hover:underline">Streaming</Link> — weekly add/drop and matchup targets.
                  </li>
                </ul>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Wrench className="w-5 h-5" />
              <CardTitle>How-To Guides</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="text-sm space-y-5">
            <div>
              <div className="font-medium flex items-center gap-2"><Settings className="w-4 h-4" /> Connect your league</div>
              <ol className="list-decimal pl-5 mt-1 space-y-1 text-muted-foreground">
                <li>Open <Link href="/authentication" className="text-primary hover:underline">League Setup</Link>.</li>
                <li>Sign in to your account if prompted.</li>
                <li>Enter your ESPN league details and save.</li>
              </ol>
            </div>
            <div>
              <div className="font-medium flex items-center gap-2"><Users className="w-4 h-4" /> Choose your team</div>
              <ol className="list-decimal pl-5 mt-1 space-y-1 text-muted-foreground">
                <li>Use the header team selector to pick your team.</li>
                <li>Team-scoped pages will reflect this selection.</li>
              </ol>
            </div>
            <div>
              <div className="font-medium flex items-center gap-2"><BarChart3 className="w-4 h-4" /> Explore standings</div>
              <ol className="list-decimal pl-5 mt-1 space-y-1 text-muted-foreground">
                <li>Open <Link href="/standings" className="text-primary hover:underline">Standings</Link>.</li>
                <li>Review rankings, records, points for/against, and trends.</li>
              </ol>
            </div>
            <div>
              <div className="font-medium flex items-center gap-2"><Search className="w-4 h-4" /> Search players and stats</div>
              <ol className="list-decimal pl-5 mt-1 space-y-1 text-muted-foreground">
                <li>Go to <Link href="/players" className="text-primary hover:underline">Player Details</Link>.</li>
                <li>Use filters (position/team) and search by name to view details.</li>
              </ol>
            </div>

            {(isPaid || isAdminOrDev) && (
              <div>
                <div className="font-medium flex items-center gap-2"><Brain className="w-4 h-4" /> Ask AI about your league</div>
                <ol className="list-decimal pl-5 mt-1 space-y-1 text-muted-foreground">
                  <li>Go to <Link href="/ai-answers" className="text-primary hover:underline">AI Answers</Link>.</li>
                  <li>Optionally include roster, standings, or waiver data.</li>
                  <li>Submit your question and review the response.</li>
                </ol>
              </div>
            )}

            {isAdminOrDev && (
              <>
                <div>
                  <div className="font-medium flex items-center gap-2"><TrendingUp className="w-4 h-4" /> Analyze a trade</div>
                  <ol className="list-decimal pl-5 mt-1 space-y-1 text-muted-foreground">
                    <li>Open <Link href="/trade-analyzer" className="text-primary hover:underline">Trade Analyzer</Link>.</li>
                    <li>Add players to each side, then run analysis.</li>
                  </ol>
                </div>
                <div>
                  <div className="font-medium flex items-center gap-2"><PlayCircle className="w-4 h-4" /> Find a player to stream</div>
                  <ol className="list-decimal pl-5 mt-1 space-y-1 text-muted-foreground">
                    <li>Go to <Link href="/streaming" className="text-primary hover:underline">Streaming</Link>.</li>
                    <li>Filter by position or matchup; add targets to shortlist.</li>
                  </ol>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="mt-6">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <MessageCircleQuestion className="w-5 h-5" />
              <CardTitle>FAQs</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="q1">
                <AccordionTrigger>Do I need to be logged in to use all features?</AccordionTrigger>
                <AccordionContent>
                  Yes. Most pages (standings, rosters, AI tools) require authentication and a connected league.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="q2">
                <AccordionTrigger>Why don’t I see certain pages like Jobs, AI, Streaming, or Trades?</AccordionTrigger>
                <AccordionContent>
                  Some features are limited by role or subscription (e.g., admin/dev-only or premium features). If you believe you should have access, contact an admin.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="q3">
                <AccordionTrigger>How does AI use my league data?</AccordionTrigger>
                <AccordionContent>
                  When you opt in, the app includes relevant league, team, and waiver data to ground AI responses for accuracy.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="q4">
                <AccordionTrigger>Can I change light/dark theme?</AccordionTrigger>
                <AccordionContent>
                  Yes. Use the theme toggle in the sidebar header to switch between light and dark modes.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="q5">
                <AccordionTrigger>Where do I report bugs or request features?</AccordionTrigger>
                <AccordionContent>
                  Please reach out to your admin or open an issue via your team’s preferred channel.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
