import React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Mail, MessageSquare, X as XIcon } from "lucide-react";

export default function Contact() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Contact Us</CardTitle>
          <CardDescription>
            Questions, feedback, or ideas — we’re listening and improving every week.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm leading-6 text-foreground/80">
          <p>
            Reach out anytime. We prioritize helpful responses and incorporate user feedback
            into our roadmap.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Email</CardTitle>
            <Mail className="w-5 h-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <a href="mailto:jasonazook@gmail.com" className="underline text-sm">
              jasonazook@gmail.com
            </a>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Social</CardTitle>
            <XIcon className="w-5 h-5 text-muted-foreground" />
          </CardHeader>
          <CardContent className="text-sm text-foreground/80">
            (Coming soon)
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Feedback</CardTitle>
            <MessageSquare className="w-5 h-5 text-muted-foreground" />
          </CardHeader>
          <CardContent className="text-sm text-foreground/80">
            Found a bug or have a feature request? Send us a note — we appreciate it.
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
