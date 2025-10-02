import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Download } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

const leagueFormSchema = z.object({
  espnLeagueId: z.string().min(1, "League ID is required"),
  sport: z.string().min(1, "Sport is required"),
  season: z.string().min(1, "Season is required"),
});

type LeagueFormData = z.infer<typeof leagueFormSchema>;

interface LeagueSelectorProps {
  disabled?: boolean;
}

export default function LeagueSelector({ disabled }: LeagueSelectorProps) {
  const { toast } = useToast();
  const { user } = useAuth();

  const form = useForm<LeagueFormData>({
    resolver: zodResolver(leagueFormSchema),
    defaultValues: {
      espnLeagueId: "",
      sport: "ffl",
      season: "2025",
    },
  });

  // Load league mutation
  const loadLeagueMutation = useMutation({
    mutationFn: async (data: LeagueFormData) => {
      const response = await apiRequest("POST", `/api/leagues/load`, {
        ...data,
        season: parseInt(data.season),
      });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "League Loaded",
        description: `Successfully loaded "${data.league.name}" with ${data.teams.length} teams`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues"] });
    },
    onError: (error: Error) => {
      console.error('League load error:', error);
      toast({
        title: "Load Failed", 
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: LeagueFormData) => {
    loadLeagueMutation.mutate(data);
  };

  return (
    <Card data-testid="card-league-selector">
      <CardHeader>
        <CardTitle>League Selection</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="espnLeagueId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>League ID</FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      placeholder="Enter league ID"
                      {...field}
                      disabled={disabled}
                      data-testid="input-league-id"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="season"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Season Year</FormLabel>
                  <FormControl>
                    <Select value={field.value} onValueChange={field.onChange} disabled={disabled}>
                      <SelectTrigger data-testid="select-season">
                        <SelectValue placeholder="Select season" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="2025">2025</SelectItem>
                        <SelectItem value="2024">2024</SelectItem>
                        <SelectItem value="2023">2023</SelectItem>
                        <SelectItem value="2022">2022</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="sport"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Sport</FormLabel>
                  <FormControl>
                    <Select value={field.value} onValueChange={field.onChange} disabled={disabled}>
                      <SelectTrigger data-testid="select-sport">
                        <SelectValue placeholder="Select sport" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ffl">Football (NFL)</SelectItem>
                        <SelectItem value="fba">Basketball (NBA)</SelectItem>
                        <SelectItem value="fhk">Hockey (NHL)</SelectItem>
                        <SelectItem value="flb">Baseball (MLB)</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button
              type="submit"
              className="w-full"
              disabled={disabled || loadLeagueMutation.isPending}
              data-testid="button-load-league"
            >
              <Download className="w-4 h-4 mr-2" />
              {loadLeagueMutation.isPending ? "Loading..." : "Load League Data"}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
