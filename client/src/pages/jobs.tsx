import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export default function Jobs() {
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState(false);

  async function runJob(endpoint: string, label: string) {
    setLoading(true);
    setStatus("");
    try {
      const res = await fetch(endpoint, { method: "POST" });
      const data = await res.json();
      setStatus(`${label}: ${data.message || "Success"}`);
    } catch (err) {
      setStatus(`${label}: Failed (${err})`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="max-w-xl mx-auto mt-8">
      <CardHeader>
        <CardTitle>Jobs & Database Updates</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button disabled={loading} onClick={() => runJob("/api/jobs/refresh-leagues", "Refresh Leagues")}>Refresh Leagues</Button>
        <Button disabled={loading} onClick={() => runJob("/api/jobs/refresh-teams", "Refresh Teams")}>Refresh Teams</Button>
        <Button disabled={loading} onClick={() => runJob("/api/jobs/refresh-players", "Refresh Players")}>Refresh Players</Button>
        <div className="mt-4 text-sm text-muted-foreground">{status}</div>
      </CardContent>
    </Card>
  );
}
