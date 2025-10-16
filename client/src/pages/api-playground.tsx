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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Send, Copy, Check, Database, ChevronLeft, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { JsonViewerWithSearch } from "@/components/json-viewer";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

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

  // Fetch tables
  const { data: tablesData } = useQuery({
    queryKey: ['/api/db/tables'],
    enabled: true,
  });

  // Fetch columns for selected table
  const { data: columnsData } = useQuery({
    queryKey: ['/api/db/tables', selectedTable, 'columns'],
    enabled: !!selectedTable,
  });

  // Fetch table data with filters
  const { data: tableData, isLoading: isLoadingData, refetch: refetchTableData } = useQuery({
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
                      <div className="border rounded-lg">
                        <ScrollArea className="h-[500px]">
                          <Table>
                            <TableHeader className="sticky top-0 bg-background">
                              <TableRow>
                                {columnsData.columns.map((column: any) => (
                                  <TableHead key={column.column_name} className="whitespace-nowrap">
                                    {column.column_name}
                                  </TableHead>
                                ))}
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {tableData.data.map((row: any, idx: number) => (
                                <TableRow key={idx} data-testid={`row-data-${idx}`}>
                                  {columnsData.columns.map((column: any) => (
                                    <TableCell key={column.column_name} className="max-w-xs truncate">
                                      {row[column.column_name]?.toString() || '-'}
                                    </TableCell>
                                  ))}
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </ScrollArea>
                      </div>

                      <div className="flex items-center justify-between">
                        <p className="text-sm text-muted-foreground">
                          Showing {page * pageSize + 1} to {Math.min((page + 1) * pageSize, tableData.total)} of {tableData.total} rows
                        </p>
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
