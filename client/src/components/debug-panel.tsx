import { useState, useEffect } from "react";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";

interface DebugRequest {
  id: string;
  timestamp: number;
  method: string;
  url: string;
  status?: number;
  requestData?: any;
  responseData?: any;
  error?: string;
  duration?: number;
}

export const debugRequests: DebugRequest[] = [];

export function addDebugRequest(request: DebugRequest) {
  const existingIndex = debugRequests.findIndex(r => r.id === request.id);
  
  if (existingIndex !== -1) {
    debugRequests[existingIndex] = request;
  } else {
    debugRequests.unshift(request);
    if (debugRequests.length > 50) {
      debugRequests.pop();
    }
  }
  
  window.dispatchEvent(new CustomEvent('debug-request-added'));
}

export default function DebugPanel() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [requests, setRequests] = useState<DebugRequest[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<DebugRequest | null>(null);

  useEffect(() => {
    const handleUpdate = () => {
      setRequests([...debugRequests]);
    };

    window.addEventListener('debug-request-added', handleUpdate);
    return () => window.removeEventListener('debug-request-added', handleUpdate);
  }, []);

  // Only show debug panel for jasonazook user
  if (user?.username !== 'jasonazook') {
    return null;
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 z-50 px-4 py-2 bg-primary text-primary-foreground rounded-md shadow-lg hover:bg-primary/90 transition-colors"
        data-testid="open-debug-panel"
      >
        Debug Panel ({requests.length})
      </button>
    );
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border shadow-2xl" data-testid="debug-panel">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/50">
        <div className="flex items-center space-x-2">
          <h3 className="font-semibold text-sm">Debug Panel - API Requests</h3>
          <span className="text-xs text-muted-foreground">({requests.length} requests)</span>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => {
              debugRequests.length = 0;
              setRequests([]);
              setSelectedRequest(null);
            }}
            className="text-xs px-2 py-1 bg-destructive/10 text-destructive hover:bg-destructive/20 rounded"
            data-testid="clear-debug-requests"
          >
            Clear
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1 hover:bg-muted rounded"
            data-testid="close-debug-panel"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex h-80">
        {/* Request List */}
        <div className="w-1/3 border-r border-border overflow-y-auto">
          {requests.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No requests yet
            </div>
          ) : (
            <div className="divide-y divide-border">
              {requests.map((req) => (
                <button
                  key={req.id}
                  onClick={() => setSelectedRequest(req)}
                  className={cn(
                    "w-full text-left p-3 hover:bg-muted/50 transition-colors",
                    selectedRequest?.id === req.id && "bg-muted"
                  )}
                  data-testid={`debug-request-${req.id}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={cn(
                      "text-xs font-mono font-semibold",
                      req.status && req.status >= 200 && req.status < 300 ? "text-green-600" :
                      req.status && req.status >= 400 ? "text-red-600" :
                      "text-yellow-600"
                    )}>
                      {req.method}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {req.duration ? `${req.duration}ms` : '...'}
                    </span>
                  </div>
                  <div className="text-xs font-mono truncate text-foreground">
                    {req.url}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {new Date(req.timestamp).toLocaleTimeString()}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Request Details */}
        <div className="flex-1 overflow-y-auto p-4">
          {selectedRequest ? (
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-semibold mb-2">Request Details</h4>
                <div className="space-y-1 text-xs">
                  <div><span className="font-semibold">Method:</span> {selectedRequest.method}</div>
                  <div><span className="font-semibold">URL:</span> {selectedRequest.url}</div>
                  <div><span className="font-semibold">Status:</span> {selectedRequest.status || 'Pending'}</div>
                  <div><span className="font-semibold">Time:</span> {new Date(selectedRequest.timestamp).toLocaleString()}</div>
                  {selectedRequest.duration && (
                    <div><span className="font-semibold">Duration:</span> {selectedRequest.duration}ms</div>
                  )}
                </div>
              </div>

              {selectedRequest.requestData && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">Request Body</h4>
                  <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                    {JSON.stringify(selectedRequest.requestData, null, 2)}
                  </pre>
                </div>
              )}

              {selectedRequest.responseData && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">Response Data</h4>
                  <pre className="text-xs bg-muted p-2 rounded overflow-x-auto max-h-96">
                    {JSON.stringify(selectedRequest.responseData, null, 2)}
                  </pre>
                </div>
              )}

              {selectedRequest.error && (
                <div>
                  <h4 className="text-sm font-semibold mb-2 text-destructive">Error</h4>
                  <pre className="text-xs bg-destructive/10 p-2 rounded overflow-x-auto">
                    {selectedRequest.error}
                  </pre>
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground text-center py-8">
              Select a request to view details
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
