import React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Trophy, Brain, BarChart3 } from "lucide-react";

export default function About() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>About Fantasy Toolbox AI</CardTitle>
          <CardDescription>
            Your playbook for smarter fantasy decisions — built for clarity and speed.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm leading-6 text-foreground/80">
          <p>
            Fantasy Toolbox AI helps managers cut through noise with streamlined tools,
            curated insights, and AI-assisted recommendations. We simplify complex data to make
            roster management, matchups, and waivers more confident and efficient.
          </p>
          <p className="mt-3">
            Built by enthusiasts for enthusiasts, we focus on practical features, fast UI,
            and continuous improvement driven by community feedback.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">AI Guidance</CardTitle>
            <Brain className="w-5 h-5 text-muted-foreground" />
          </CardHeader>
          <CardContent className="text-sm text-foreground/80">
            Smart answers and suggestions for lineup decisions, waivers, and trade ideas.
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">League Insights</CardTitle>
            <BarChart3 className="w-5 h-5 text-muted-foreground" />
          </CardHeader>
          <CardContent className="text-sm text-foreground/80">
            Clean tables and summaries for standings, rosters, and player trends.
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Built for Winning</CardTitle>
            <Trophy className="w-5 h-5 text-muted-foreground" />
          </CardHeader>
          <CardContent className="text-sm text-foreground/80">
            Fast, reliable, and designed to keep you a step ahead each week.
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
