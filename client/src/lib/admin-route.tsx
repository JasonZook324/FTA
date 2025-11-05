import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import { Redirect, Route } from "wouter";

export function AdminRoute({
  path,
  component: Component,
  adminOnly = false, // If true, only role 9 (admin) can access; if false, role 9 or 2 (admin/dev) can access
}: {
  path: string;
  component: () => React.JSX.Element;
  adminOnly?: boolean;
}) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <Route path={path}>
        <div className="flex items-center justify-center min-h-screen" data-testid="loading-auth">
          <Loader2 className="h-8 w-8 animate-spin text-border" />
        </div>
      </Route>
    );
  }

  if (!user) {
    return (
      <Route path={path}>
        <Redirect to="/auth" />
      </Route>
    );
  }

  // Check access based on adminOnly flag
  const hasAccess = adminOnly 
    ? user.role === 9 // Admin only
    : (user.role === 9 || user.role === 2); // Admin or Developer
  
  if (!hasAccess) {
    return (
      <Route path={path}>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center p-8">
            <h1 className="text-2xl font-bold text-foreground mb-2">Access Denied</h1>
            <p className="text-muted-foreground">You don't have permission to access this page.</p>
          </div>
        </div>
      </Route>
    );
  }

  return <Route path={path}><Component /></Route>;
}
