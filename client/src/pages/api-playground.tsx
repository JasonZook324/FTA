import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Send, Copy, Check, Database, ChevronLeft, ChevronRight, Info } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { JsonViewerWithSearch } from "@/components/json-viewer";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

// Fantasy Pros API endpoint definitions
type EndpointParam = {
  name: string;
  label: string;
  type: "number" | "select";
  required: boolean;
  defaultValue?: string;
  options?: readonly string[];
};

type EndpointConfig = {
  name: string;
  path: string;
  params: EndpointParam[];
};

const FANTASY_PROS_ENDPOINTS: Record<string, EndpointConfig> = {
  players: {
    name: "Players",
    path: "/players",
    params: []
  },
  injuries: {
    name: "Injuries",
    path: "/injuries",
    params: [
      { name: "year", label: "Season", type: "number", required: true, defaultValue: "2025" }
    ]
  },
  rankings: {
    name: "Consensus Rankings",
    path: "/{season}/consensus-rankings",
    params: [
      { name: "season", label: "Season", type: "number", required: true, defaultValue: "2025" },
      { name: "type", label: "Rank Type", type: "select", required: true, options: ["draft", "weekly", "ros"], defaultValue: "weekly" },
      { name: "scoring", label: "Scoring", type: "select", required: true, options: ["PPR", "HALF_PPR", "STD"], defaultValue: "PPR" },
      { name: "position", label: "Position", type: "select", required: true, options: ["QB", "RB", "WR", "TE", "K", "DST"], defaultValue: "QB" },
      { name: "week", label: "Week", type: "number", required: false }
    ]
  },
  projections: {
    name: "Projections",
    path: "/{season}/projections",
    params: [
      { name: "season", label: "Season", type: "number", required: true, defaultValue: "2025" },
      { name: "scoring", label: "Scoring", type: "select", required: true, options: ["PPR", "HALF_PPR", "STD"], defaultValue: "PPR" },
      { name: "week", label: "Week", type: "number", required: false },
      { name: "position", label: "Position", type: "select", required: false, options: ["QB", "RB", "WR", "TE", "K", "DST"] }
    ]
  },
  news: {
    name: "News",
    path: "/news",
    params: [
      { name: "limit", label: "Limit", type: "number", required: false, defaultValue: "50" }
    ]
  }
};

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
  const [selectedEndpoint, setSelectedEndpoint] = useState<string>("players");
  const [endpointParams, setEndpointParams] = useState<Record<string, string>>({});
  const [isCustomUrl, setIsCustomUrl] = useState<boolean>(false);
  const { toast } = useToast();

  // Database viewer state
  const [selectedTable, setSelectedTable] = useState<string>("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [page, setPage] = useState(0);
  const pageSize = 50;

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

  // Initialize manual mode and custom endpoint from localStorage
  // and keep the endpoint in sync depending on the mode
  // We intentionally keep this light-weight without extra deps
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useState(() => {
    try {
      const savedManual = localStorage.getItem('apiPlayground.isCustomUrl');
      const savedEndpoint = localStorage.getItem('apiPlayground.customEndpoint');
      if (savedManual === 'true') {
        setIsCustomUrl(true);
        if (savedEndpoint) {
          form.setValue('endpoint', savedEndpoint);
        }
      } else {
        // Ensure endpoint matches current defaults when not manual
        const url = buildEndpointUrlFor(selectedEndpoint, endpointParams);
        form.setValue('endpoint', url || form.getValues('endpoint'));
      }
    } catch {}
    return undefined;
  });

  // Build endpoint URL from selected endpoint and parameters
  const buildEndpointUrl = () => {
    const endpointConfig = FANTASY_PROS_ENDPOINTS[selectedEndpoint];
    let path = endpointConfig.path;
    const queryParts: string[] = [];

    // Replace path parameters (e.g., {season})
    endpointConfig.params.forEach(param => {
      const value = endpointParams[param.name] || param.defaultValue || "";
      if (path.includes(`{${param.name}}`)) {
        path = path.replace(`{${param.name}}`, value);
      } else if (value && param.type !== "number" || (param.type === "number" && value)) {
        queryParts.push(`${param.name}=${encodeURIComponent(value)}`);
      }
    });

    const baseUrl = "https://api.fantasypros.com/public/v2/json/NFL";
    const queryString = queryParts.length > 0 ? `?${queryParts.join("&")}` : "";
    return `${baseUrl}${path}${queryString}`;
  };

  // Initialize endpoint parameters with defaults when endpoint changes
  const handleEndpointChange = (endpoint: string) => {
    setSelectedEndpoint(endpoint);
    const config = FANTASY_PROS_ENDPOINTS[endpoint];
    if (!config) return;
    
    const defaultParams: Record<string, string> = {};
    config.params.forEach(param => {
      if (param.defaultValue) {
        defaultParams[param.name] = param.defaultValue;
      }
    });
    setEndpointParams(defaultParams);
    
    // Update form endpoint value
    if (!isCustomUrl) {
      const url = buildEndpointUrlFor(endpoint, defaultParams);
      form.setValue("endpoint", url);
    }
  };

  const buildEndpointUrlFor = (endpoint: string, params: Record<string, string>) => {
    const endpointConfig = FANTASY_PROS_ENDPOINTS[endpoint];
    if (!endpointConfig) return "";
    
    let path = endpointConfig.path;
    const queryParts: string[] = [];

    endpointConfig.params.forEach(param => {
      const value = params[param.name] || param.defaultValue || "";
      if (path.includes(`{${param.name}}`)) {
        path = path.replace(`{${param.name}}`, value);
      } else if (value) {
        queryParts.push(`${param.name}=${encodeURIComponent(value)}`);
      }
    });

    const baseUrl = "https://api.fantasypros.com/public/v2/json/NFL";
    const queryString = queryParts.length > 0 ? `?${queryParts.join("&")}` : "";
    return `${baseUrl}${path}${queryString}`;
  };

  // Update endpoint URL when parameters change
  const handleParamChange = (paramName: string, value: string) => {
    const newParams = { ...endpointParams, [paramName]: value };
    setEndpointParams(newParams);
    if (!isCustomUrl) {
      const url = buildEndpointUrlFor(selectedEndpoint, newParams);
      form.setValue("endpoint", url);
    }
  };

  const onSubmit = async (data: ApiRequestForm) => {
    setIsLoading(true);
    setResponse(null);

    try {
      // Basic URL validation
      try {
        const test = new URL(data.endpoint);
        if (!(test.protocol === 'http:' || test.protocol === 'https:')) {
          throw new Error('Endpoint must start with http or https');
        }
      } catch (e: any) {
        toast({ title: 'Invalid URL', description: e.message || 'Please provide a valid URL', variant: 'destructive' });
        setIsLoading(false);
        return;
      }
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

  // Fetch tables
  const { data: tablesData } = useQuery<{ tables?: any[] }>({
    queryKey: ['/api/db/tables'],
    enabled: true,
  });

  // Fetch columns for selected table
  const { data: columnsData } = useQuery<{ columns?: any[] }>({
    queryKey: ['/api/db/tables', selectedTable, 'columns'],
    enabled: !!selectedTable,
  });

  // Fetch table data with filters
  const { data: tableData, isLoading: isLoadingData, refetch: refetchTableData } = useQuery<{ data?: any[]; total?: number; hasMore?: boolean }>({
    queryKey: ['/api/db/tables', selectedTable, 'data', filters, page],
    queryFn: async () => {
      if (!selectedTable) return null;
      const res = await fetch(`/api/db/tables/${selectedTable}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filters,
          limit: pageSize,
          offset: page * pageSize,
        }),
      });
      if (!res.ok) throw new Error('Failed to fetch table data');
      return res.json();
    },
    enabled: !!selectedTable,
  });

  const handleFilterChange = (column: string, value: string) => {
    setFilters(prev => ({ ...prev, [column]: value }));
    setPage(0); // Reset to first page when filtering
  };

  const handleTableChange = (tableName: string) => {
    setSelectedTable(tableName);
    setFilters({});
    setPage(0);
  };

  return (
    <div className="container mx-auto p-4 lg:p-6 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-foreground mb-2">API Playground</h1>
        <p className="text-muted-foreground">Test Fantasy Pros API endpoints and view database tables</p>
      </div>

      <Tabs defaultValue="api-tester" className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-6">
          <TabsTrigger value="api-tester" data-testid="tab-api-tester">
            API Tester
          </TabsTrigger>
          <TabsTrigger value="db-viewer" data-testid="tab-db-viewer">
            <Database className="h-4 w-4 mr-2" />
            Database Viewer
          </TabsTrigger>
        </TabsList>

        <TabsContent value="api-tester" className="space-y-6">
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

                    <div>
                      <FormLabel>Select Endpoint</FormLabel>
                      <Select 
                        value={selectedEndpoint} 
                        onValueChange={handleEndpointChange}
                      >
                        <SelectTrigger data-testid="select-endpoint" className="mt-2">
                          <SelectValue placeholder="Select an endpoint" />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(FANTASY_PROS_ENDPOINTS).map(([key, config]) => (
                            <SelectItem key={key} value={key}>
                              {config.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-sm text-muted-foreground mt-2">
                        Choose an API endpoint to test
                      </p>
                    </div>

                    {/* Dynamic endpoint parameters */}
                    {FANTASY_PROS_ENDPOINTS[selectedEndpoint].params.length > 0 && (
                      <div className="space-y-4 border rounded-lg p-4 bg-muted/20">
                        <h4 className="text-sm font-semibold">Endpoint Parameters</h4>
                        {FANTASY_PROS_ENDPOINTS[selectedEndpoint].params.map((param) => (
                          <div key={param.name}>
                            <FormLabel>
                              {param.label}
                              {param.required && <span className="text-destructive ml-1">*</span>}
                            </FormLabel>
                            {param.type === "select" ? (
                              <Select
                                value={endpointParams[param.name] || param.defaultValue || ""}
                                onValueChange={(value) => handleParamChange(param.name, value)}
                              >
                                <SelectTrigger data-testid={`select-param-${param.name}`} className="mt-2">
                                  <SelectValue placeholder={`Select ${param.label}`} />
                                </SelectTrigger>
                                <SelectContent>
                                  {param.options?.map((option) => (
                                    <SelectItem key={option} value={option}>
                                      {option}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <Input
                                type={param.type}
                                value={endpointParams[param.name] || ""}
                                onChange={(e) => handleParamChange(param.name, e.target.value)}
                                placeholder={param.defaultValue || ""}
                                data-testid={`input-param-${param.name}`}
                                className="mt-2"
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    <FormField
                      control={form.control}
                      name="endpoint"
                      render={({ field }) => (
                        <FormItem>
                          <div className="flex items-center justify-between">
                            <FormLabel>Endpoint URL</FormLabel>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">Edit URL manually</span>
                              <Switch
                                checked={isCustomUrl}
                                onCheckedChange={(checked) => {
                                  setIsCustomUrl(!!checked);
                                  // When turning off manual mode, regenerate from current params
                                  if (!checked) {
                                    const url = buildEndpointUrlFor(selectedEndpoint, endpointParams);
                                    form.setValue('endpoint', url);
                                    localStorage.removeItem('apiPlayground.customEndpoint');
                                  } else {
                                    // Persist current value as custom
                                    localStorage.setItem('apiPlayground.customEndpoint', form.getValues('endpoint'));
                                  }
                                  localStorage.setItem('apiPlayground.isCustomUrl', String(!!checked));
                                }}
                                data-testid="switch-edit-url"
                              />
                            </div>
                          </div>
                          <FormControl>
                            <Input 
                              value={field.value}
                              onChange={(e) => {
                                field.onChange(e);
                                if (isCustomUrl) {
                                  localStorage.setItem('apiPlayground.customEndpoint', e.target.value);
                                }
                              }}
                              data-testid="input-endpoint"
                              className="font-mono text-sm"
                              readOnly={!isCustomUrl}
                            />
                          </FormControl>
                          <FormDescription>
                            {isCustomUrl 
                              ? 'Manual mode: editing URL directly (not overwritten by parameter changes).'
                              : 'Auto-generated from selected endpoint and parameters'}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="queryParams"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Additional Query Parameters (Optional)</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="param1=value1&param2=value2" 
                              {...field}
                              data-testid="input-query-params"
                            />
                          </FormControl>
                          <FormDescription>Extra query parameters if needed (API key will be added automatically)</FormDescription>
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
          <Card>
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
        </TabsContent>

        <TabsContent value="db-viewer" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Database Tables</CardTitle>
              <CardDescription>Select a table to view and filter its data</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-4 items-end">
                <div className="flex-1">
                  <label className="text-sm font-medium mb-2 block">Select Table</label>
                  <Select value={selectedTable} onValueChange={handleTableChange}>
                    <SelectTrigger data-testid="select-table">
                      <SelectValue placeholder="Choose a table..." />
                    </SelectTrigger>
                    <SelectContent>
                      {tablesData?.tables?.map((table: any) => (
                        <SelectItem key={table.table_name} value={table.table_name}>
                          {table.table_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {selectedTable && columnsData?.columns && (
                <div className="space-y-4">
                  <div className="border rounded-lg p-4">
                    <h3 className="font-semibold mb-3">Filter by Columns</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {columnsData.columns.map((column: any) => (
                        <div key={column.column_name}>
                          <label className="text-xs font-medium mb-1 block">{column.column_name}</label>
                          <Input
                            placeholder={`Filter ${column.column_name}...`}
                            value={filters[column.column_name] || ''}
                            onChange={(e) => handleFilterChange(column.column_name, e.target.value)}
                            data-testid={`filter-${column.column_name}`}
                            className="text-sm"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {isLoadingData ? (
                    <div className="flex items-center justify-center h-32">
                      <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                  ) : tableData?.data && tableData.data.length > 0 ? (
                    <>
                      <div className="border rounded-lg overflow-x-auto">
                        <div className="overflow-y-auto max-h-[500px]">
                          <Table>
                            <TableHeader className="sticky top-0 bg-background z-10">
                              <TableRow>
                                {columnsData.columns.map((column: any) => (
                                  <TableHead key={column.column_name} className="whitespace-nowrap min-w-[120px]">
                                    {column.column_name}
                                  </TableHead>
                                ))}
                                <TableHead className="w-20">Actions</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {tableData.data.map((row: any, idx: number) => (
                                <TableRow key={idx} data-testid={`row-data-${idx}`}>
                                  {columnsData?.columns?.map((column: any, colIdx: number) => {
                                    const value = row[column.column_name];
                                    let cellValue = '-';
                                    
                                    if (value !== null && value !== undefined) {
                                      // Check if it's a JSON object
                                      if (typeof value === 'object') {
                                        cellValue = JSON.stringify(value);
                                      } else {
                                        cellValue = value.toString();
                                      }
                                    }
                                    
                                    return (
                                      <TableCell 
                                        key={column.column_name} 
                                        className="max-w-xs"
                                      >
                                        <div className="truncate">
                                          {cellValue}
                                        </div>
                                      </TableCell>
                                    );
                                  })}
                                  <TableCell className="w-20">
                                    <Dialog>
                                      <DialogTrigger asChild>
                                        <Button 
                                          variant="ghost" 
                                          size="sm"
                                          data-testid={`button-more-info-${idx}`}
                                        >
                                          <Info className="h-4 w-4" />
                                        </Button>
                                      </DialogTrigger>
                                      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                                        <DialogHeader>
                                          <DialogTitle>Record Details</DialogTitle>
                                          <DialogDescription>
                                            Complete data for this record
                                          </DialogDescription>
                                        </DialogHeader>
                                        <div className="space-y-3">
                                          {columnsData?.columns?.map((column: any) => {
                                            const value = row[column.column_name];
                                            let displayValue = '-';
                                            
                                            if (value !== null && value !== undefined) {
                                              // Check if it's a JSON object
                                              if (typeof value === 'object') {
                                                displayValue = JSON.stringify(value, null, 2);
                                              } else {
                                                displayValue = value.toString();
                                              }
                                            }
                                            
                                            return (
                                              <div key={column.column_name} className="border-b pb-3 last:border-b-0">
                                                <div className="text-sm font-semibold text-muted-foreground mb-1">
                                                  {column.column_name}
                                                </div>
                                                <div className="text-sm break-words whitespace-pre-wrap font-mono">
                                                  {displayValue !== '-' ? displayValue : <span className="text-muted-foreground">-</span>}
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </DialogContent>
                                    </Dialog>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        {typeof tableData?.total === 'number' && (
                          <p className="text-sm text-muted-foreground">
                            Showing {page * pageSize + 1} to {Math.min((page + 1) * pageSize, tableData.total)} of {tableData.total} rows
                          </p>
                        )}
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage(p => Math.max(0, p - 1))}
                            disabled={page === 0}
                            data-testid="button-prev-page"
                          >
                            <ChevronLeft className="h-4 w-4 mr-1" />
                            Previous
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage(p => p + 1)}
                            disabled={!tableData.hasMore}
                            data-testid="button-next-page"
                          >
                            Next
                            <ChevronRight className="h-4 w-4 ml-1" />
                          </Button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="text-center text-muted-foreground py-12">
                      No data found
                    </div>
                  )}
                </div>
              )}

              {!selectedTable && (
                <div className="text-center text-muted-foreground py-12">
                  <Database className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Select a table to view its data</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
