import { useState } from "react";
import { ChevronDown, ChevronRight, Copy, Check, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

interface JsonViewerProps {
  data: any;
  searchQuery?: string;
}

interface JsonNodeProps {
  keyName?: string;
  value: any;
  level?: number;
  searchQuery?: string;
}

function JsonNode({ keyName, value, level = 0, searchQuery = "" }: JsonNodeProps) {
  const [isExpanded, setIsExpanded] = useState(level < 2);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const copyValue = (val: any) => {
    navigator.clipboard.writeText(typeof val === 'string' ? val : JSON.stringify(val, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1000);
    toast({
      title: "Copied",
      description: "Value copied to clipboard",
    });
  };

  const highlightMatch = (text: string) => {
    if (!searchQuery || !text) return text;
    const parts = text.toString().split(new RegExp(`(${searchQuery})`, 'gi'));
    return parts.map((part, i) => 
      part.toLowerCase() === searchQuery.toLowerCase() ? 
        <mark key={i} className="bg-yellow-300 dark:bg-yellow-600">{part}</mark> : part
    );
  };

  const isObject = value !== null && typeof value === 'object' && !Array.isArray(value);
  const isArray = Array.isArray(value);
  const isPrimitive = !isObject && !isArray;

  const hasMatch = (obj: any, query: string): boolean => {
    if (!query) return true;
    const lowerQuery = query.toLowerCase();
    
    if (typeof obj === 'string' || typeof obj === 'number') {
      return obj.toString().toLowerCase().includes(lowerQuery);
    }
    
    if (Array.isArray(obj)) {
      return obj.some(item => hasMatch(item, query));
    }
    
    if (obj !== null && typeof obj === 'object') {
      return Object.entries(obj).some(([k, v]) => 
        k.toLowerCase().includes(lowerQuery) || hasMatch(v, query)
      );
    }
    
    return false;
  };

  if (!hasMatch({ [keyName || '']: value }, searchQuery)) {
    return null;
  }

  if (isPrimitive) {
    const valueColor = 
      typeof value === 'string' ? 'text-green-600 dark:text-green-400' :
      typeof value === 'number' ? 'text-blue-600 dark:text-blue-400' :
      typeof value === 'boolean' ? 'text-purple-600 dark:text-purple-400' :
      'text-gray-500 dark:text-gray-400';

    return (
      <div className="flex items-start group" style={{ paddingLeft: `${level * 20}px` }}>
        {keyName && (
          <span className="text-red-600 dark:text-red-400 font-medium mr-2">
            {highlightMatch(keyName)}:
          </span>
        )}
        <span className={valueColor}>
          {typeof value === 'string' ? `"${highlightMatch(value)}"` : highlightMatch(String(value))}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-5 w-5 p-0 ml-2 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={() => copyValue(value)}
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        </Button>
      </div>
    );
  }

  const entries: [string, any][] = isArray ? value.map((v: any, i: number) => [i.toString(), v]) : Object.entries(value);
  const itemCount = entries.length;

  return (
    <div style={{ paddingLeft: `${level * 20}px` }}>
      <div className="flex items-center group">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center hover:bg-muted rounded px-1 -ml-1"
          data-testid={`json-toggle-${keyName}`}
        >
          {isExpanded ? 
            <ChevronDown className="h-4 w-4 text-muted-foreground" /> : 
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          }
          {keyName && (
            <span className="text-red-600 dark:text-red-400 font-medium ml-1">
              {highlightMatch(keyName)}:
            </span>
          )}
          <span className="text-muted-foreground ml-2">
            {isArray ? '[' : '{'}{!isExpanded && ` ${itemCount} ${itemCount === 1 ? 'item' : 'items'} `}{isArray ? ']' : '}'}
          </span>
        </button>
        <Button
          variant="ghost"
          size="sm"
          className="h-5 w-5 p-0 ml-2 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={() => copyValue(value)}
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        </Button>
      </div>
      {isExpanded && (
        <div className="border-l-2 border-muted ml-2 my-1">
          {entries.map(([k, v]) => (
            <JsonNode 
              key={k} 
              keyName={isArray ? undefined : k} 
              value={v} 
              level={level + 1}
              searchQuery={searchQuery}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function JsonViewer({ data, searchQuery = "" }: JsonViewerProps) {
  return (
    <div className="font-mono text-sm">
      <JsonNode value={data} searchQuery={searchQuery} />
    </div>
  );
}

export function JsonViewerWithSearch({ data }: { data: any }) {
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search keys or values..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1"
          data-testid="input-json-search"
        />
      </div>
      <div className="border rounded-md p-4 bg-muted/30 max-h-[500px] overflow-auto">
        <JsonViewer data={data} searchQuery={searchQuery} />
      </div>
    </div>
  );
}
