import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Loader2, Send, Copy, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { JsonViewerWithSearch } from "@/components/json-viewer";

const apiRequestSchema = z.object({
  apiKey: z.string().optional(),
  method: z.enum(["GET", "POST"]),
  endpoint: z.string().min(1, "Endpoint is required"),
  queryParams: z.string().optional(),
  body: z.string().optional(),
});

type ApiRequestForm = z.infer<typeof apiRequestSchema>;

export default function ApiPlayground() {
  const [response, setResponse] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const form = useForm<ApiRequestForm>({
    resolver: zodResolver(apiRequestSchema),
    defaultValues: {
      apiKey: "",
      method: "GET",
      endpoint: "https://api.fantasypros.com/public/v2/json/NFL/players",
      queryParams: "",
      body: "",
    },
  });

  const onSubmit = async (data: ApiRequestForm) => {
    setIsLoading(true);
    setResponse(null);

    try {
      // Use backend proxy to avoid CORS issues
      const res = await fetch('/api/fantasy-pros-proxy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          apiKey: data.apiKey,
          method: data.method,
          endpoint: data.endpoint,
          queryParams: data.queryParams,
          body: data.method === 'POST' ? data.body : undefined,
        }),
      });

      const responseData = await res.json();

      setResponse(responseData);

      if (!res.ok) {
        toast({
          title: "Request failed",
          description: responseData.message || `Status: ${res.status} ${res.statusText}`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Request successful",
          description: "Response received",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error making request",
        description: error.message,
        variant: "destructive",
      });
      setResponse({
        error: error.message,
        stack: error.stack,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({
      title: "Copied to clipboard",
      description: "Response has been copied",
    });
  };

  return (
    <div className="container mx-auto p-4 lg:p-6 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-foreground mb-2">API Playground</h1>
        <p className="text-muted-foreground">Test Fantasy Pros API endpoints and inspect responses</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Request Form */}
        <Card>
          <CardHeader>
            <CardTitle>Request Configuration</CardTitle>
            <CardDescription>Configure your API request parameters</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="apiKey"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>API Key (Optional)</FormLabel>
                      <FormControl>
                        <Input 
                          type="password" 
                          placeholder="Leave empty to use environment API key" 
                          {...field}
                          data-testid="input-api-key"
                        />
                      </FormControl>
                      <FormDescription>Leave empty to use the API key from environment variables</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="method"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>HTTP Method</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-method">
                            <SelectValue placeholder="Select method" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="GET">GET</SelectItem>
                          <SelectItem value="POST">POST</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="endpoint"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Endpoint URL</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="https://api.fantasypros.com/v2/json/nfl/..." 
                          {...field}
                          data-testid="input-endpoint"
                        />
                      </FormControl>
                      <FormDescription>Full API endpoint URL</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="queryParams"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Query Parameters (Optional)</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="param1=value1&param2=value2" 
                          {...field}
                          data-testid="input-query-params"
                        />
                      </FormControl>
                      <FormDescription>Additional query parameters (API key will be added automatically)</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {form.watch("method") === "POST" && (
                  <FormField
                    control={form.control}
                    name="body"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Request Body (JSON)</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder='{"key": "value"}' 
                            className="font-mono text-sm"
                            rows={5}
                            {...field}
                            data-testid="input-body"
                          />
                        </FormControl>
                        <FormDescription>JSON request body</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <Button 
                  type="submit" 
                  disabled={isLoading} 
                  className="w-full"
                  data-testid="button-send-request"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="mr-2 h-4 w-4" />
                      Send Request
                    </>
                  )}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        {/* Response Display */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Response</CardTitle>
              <CardDescription>API response details</CardDescription>
            </div>
            {response && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyToClipboard(JSON.stringify(response, null, 2))}
                data-testid="button-copy-response"
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 mr-2" />
                    Copy
                  </>
                )}
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {!response ? (
              <div className="flex items-center justify-center h-64 text-muted-foreground">
                <p>Send a request to see the response</p>
              </div>
            ) : (
              <Tabs defaultValue="formatted" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="formatted">Interactive</TabsTrigger>
                  <TabsTrigger value="raw">Raw JSON</TabsTrigger>
                </TabsList>
                <TabsContent value="formatted" className="mt-4">
                  {response.status && (
                    <div className="mb-4">
                      <Badge 
                        variant={response.status >= 200 && response.status < 300 ? "default" : "destructive"}
                        data-testid="badge-status"
                      >
                        {response.status} {response.statusText}
                      </Badge>
                    </div>
                  )}
                  <JsonViewerWithSearch data={response.data || response} />
                </TabsContent>
                <TabsContent value="raw" className="mt-4">
                  <ScrollArea className="h-[500px] w-full rounded-md border p-4">
                    <pre className="text-sm font-mono" data-testid="text-raw-response">
                      {JSON.stringify(response, null, 2)}
                    </pre>
                  </ScrollArea>
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Example Endpoints */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Example Endpoints</CardTitle>
          <CardDescription>Common Fantasy Pros API endpoints to get you started</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <h4 className="font-semibold text-sm">NFL Players</h4>
              <code className="block text-xs bg-muted p-2 rounded">
                https://api.fantasypros.com/public/v2/json/NFL/players
              </code>
              <p className="text-xs text-muted-foreground">Returns all NFL players</p>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold text-sm">NFL News</h4>
              <code className="block text-xs bg-muted p-2 rounded">
                https://api.fantasypros.com/public/v2/json/NFL/news
              </code>
              <p className="text-xs text-muted-foreground">Query: limit=10</p>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold text-sm">NFL Projections</h4>
              <code className="block text-xs bg-muted p-2 rounded">
                https://api.fantasypros.com/public/v2/json/nfl/2024/projections
              </code>
              <p className="text-xs text-muted-foreground">Query: position=QB&week=6</p>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold text-sm">Consensus Rankings</h4>
              <code className="block text-xs bg-muted p-2 rounded">
                https://api.fantasypros.com/public/v2/json/NFL/2024/consensus-rankings
              </code>
              <p className="text-xs text-muted-foreground">Query: position=QB&type=draft</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
