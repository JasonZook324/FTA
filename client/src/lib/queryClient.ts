import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { addDebugRequest } from "@/components/debug-panel";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const requestId = `${Date.now()}-${Math.random()}`;
  const startTime = Date.now();

  addDebugRequest({
    id: requestId,
    timestamp: startTime,
    method,
    url,
    requestData: data,
  });

  try {
    const res = await fetch(url, {
      method,
      headers: data ? { "Content-Type": "application/json" } : {},
      body: data ? JSON.stringify(data) : undefined,
      credentials: "include",
    });

    const duration = Date.now() - startTime;
    let responseData;
    
    try {
      const clonedRes = res.clone();
      responseData = await clonedRes.json();
    } catch {
      responseData = null;
    }

    addDebugRequest({
      id: requestId,
      timestamp: startTime,
      method,
      url,
      status: res.status,
      requestData: data,
      responseData,
      duration,
    });

    await throwIfResNotOk(res);
    return res;
  } catch (error) {
    const duration = Date.now() - startTime;
    addDebugRequest({
      id: requestId,
      timestamp: startTime,
      method,
      url,
      requestData: data,
      error: error instanceof Error ? error.message : String(error),
      duration,
    });
    throw error;
  }
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const url = queryKey.join("/") as string;
    const requestId = `${Date.now()}-${Math.random()}`;
    const startTime = Date.now();

    addDebugRequest({
      id: requestId,
      timestamp: startTime,
      method: 'GET',
      url,
    });

    try {
      const res = await fetch(url, {
        credentials: "include",
      });

      if (unauthorizedBehavior === "returnNull" && res.status === 401) {
        const duration = Date.now() - startTime;
        addDebugRequest({
          id: requestId,
          timestamp: startTime,
          method: 'GET',
          url,
          status: 401,
          responseData: null,
          duration,
        });
        return null;
      }

      await throwIfResNotOk(res);
      const responseData = await res.json();
      const duration = Date.now() - startTime;

      addDebugRequest({
        id: requestId,
        timestamp: startTime,
        method: 'GET',
        url,
        status: res.status,
        responseData,
        duration,
      });

      return responseData;
    } catch (error) {
      const duration = Date.now() - startTime;
      addDebugRequest({
        id: requestId,
        timestamp: startTime,
        method: 'GET',
        url,
        error: error instanceof Error ? error.message : String(error),
        duration,
      });
      throw error;
    }
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
