import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { RefreshCw, Pencil, Trash2, CheckCircle, XCircle, UserCog } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

type UserWithVerification = {
  id: string;
  username: string;
  email: string | null;
  role: number;
  selectedLeagueId: string | null;
  selectedTeamId: number | null;
  createdAt: Date;
  verified: boolean | null;
  verificationCreatedAt: Date | null;
  verificationExpiresAt: Date | null;
};

type EditUserForm = {
  username: string;
  email: string;
  role: number;
  password: string;
};

export default function ManageMembers() {
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const [editingUser, setEditingUser] = useState<UserWithVerification | null>(null);
  const [editForm, setEditForm] = useState<EditUserForm>({ username: "", email: "", role: 0, password: "" });
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  // Fetch all users
  const { data: users, isLoading, refetch } = useQuery<UserWithVerification[]>({
    queryKey: ["/api/admin/users"],
  });

  // Update user mutation
  const updateUserMutation = useMutation({
    mutationFn: async ({ userId, updates }: { userId: string; updates: Partial<EditUserForm> }) => {
      const response = await apiRequest("PATCH", `/api/admin/users/${userId}`, updates);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "User updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      handleDialogClose(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update user",
        variant: "destructive",
      });
    },
  });

  // Delete user mutation
  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await apiRequest("DELETE", `/api/admin/users/${userId}`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "User deleted successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete user",
        variant: "destructive",
      });
    },
  });

  const handleEditClick = (user: UserWithVerification) => {
    setEditingUser(user);
    setEditForm({
      username: user.username,
      email: user.email || "",
      role: user.role,
      password: "", // Empty password means no change
    });
    setIsEditDialogOpen(true);
  };

  const handleEditSubmit = () => {
    if (!editingUser) return;

    // Validate password if provided
    if (editForm.password && editForm.password.length > 0 && editForm.password.length < 6) {
      toast({
        title: "Invalid password",
        description: "Password must be at least 6 characters long",
        variant: "destructive",
      });
      return;
    }

    const updates: Partial<EditUserForm> = {};
    if (editForm.username !== editingUser.username) updates.username = editForm.username;
    if (editForm.email !== editingUser.email) updates.email = editForm.email;
    if (editForm.role !== editingUser.role) updates.role = editForm.role;
    if (editForm.password && editForm.password.length >= 6) updates.password = editForm.password;

    if (Object.keys(updates).length === 0) {
      toast({
        title: "No changes",
        description: "No changes were made",
      });
      return;
    }

    updateUserMutation.mutate({ userId: editingUser.id, updates });
  };

  const handleDialogClose = (open: boolean) => {
    setIsEditDialogOpen(open);
    if (!open) {
      // Reset form when closing
      setEditingUser(null);
      setEditForm({ username: "", email: "", role: 0, password: "" });
    }
  };

  const getRoleBadge = (role: number) => {
    const roleConfig = {
      9: { label: "Admin", className: "bg-purple-500/20 text-purple-700 dark:text-purple-300" },
      2: { label: "Developer", className: "bg-blue-500/20 text-blue-700 dark:text-blue-300" },
      1: { label: "Paid", className: "bg-green-500/20 text-green-700 dark:text-green-300" },
      0: { label: "Standard", className: "bg-gray-500/20 text-gray-700 dark:text-gray-300" },
    };
    const config = roleConfig[role as keyof typeof roleConfig] || roleConfig[0];
    return <Badge className={config.className}>{config.label}</Badge>;
  };

  const formatDate = (date: Date | null) => {
    if (!date) return "N/A";
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <>
      {/* Header Bar */}
      <header className="bg-card border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <UserCog className="h-6 w-6" />
              Manage Members
            </h2>
            <p className="text-muted-foreground">View and manage all users in the system</p>
          </div>
          <Button
            onClick={() => refetch()}
            variant="outline"
            size="sm"
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle>All Users</CardTitle>
            <CardDescription>
              Total users: {users?.length || 0}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">
                <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Loading users...</p>
              </div>
            ) : users && users.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Username</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Verified</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">{user.username}</TableCell>
                        <TableCell>{user.email || "N/A"}</TableCell>
                        <TableCell>{getRoleBadge(user.role)}</TableCell>
                        <TableCell>
                          {user.verified ? (
                            <div className="flex items-center gap-1 text-green-600">
                              <CheckCircle className="h-4 w-4" />
                              <span className="text-sm">Yes</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-red-600">
                              <XCircle className="h-4 w-4" />
                              <span className="text-sm">No</span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell>{formatDate(user.createdAt)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Dialog open={isEditDialogOpen && editingUser?.id === user.id} onOpenChange={handleDialogClose}>
                              <DialogTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleEditClick(user)}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>Edit User</DialogTitle>
                                  <DialogDescription>
                                    Modify user details. Changes will take effect immediately.
                                  </DialogDescription>
                                </DialogHeader>
                                <div className="space-y-4 py-4">
                                  <div className="space-y-2">
                                    <Label htmlFor="edit-username">Username</Label>
                                    <Input
                                      id="edit-username"
                                      value={editForm.username}
                                      onChange={(e) =>
                                        setEditForm({ ...editForm, username: e.target.value })
                                      }
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <Label htmlFor="edit-email">Email</Label>
                                    <Input
                                      id="edit-email"
                                      type="email"
                                      value={editForm.email}
                                      onChange={(e) =>
                                        setEditForm({ ...editForm, email: e.target.value })
                                      }
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <Label htmlFor="edit-role">Role</Label>
                                    <Select
                                      value={editForm.role.toString()}
                                      onValueChange={(value) =>
                                        setEditForm({ ...editForm, role: parseInt(value) })
                                      }
                                      disabled={user.id === currentUser?.id}
                                    >
                                      <SelectTrigger id="edit-role">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="0">Standard User</SelectItem>
                                        <SelectItem value="1">Paid User</SelectItem>
                                        <SelectItem value="2">Developer</SelectItem>
                                        <SelectItem value="9">Administrator</SelectItem>
                                      </SelectContent>
                                    </Select>
                                    {user.id === currentUser?.id && (
                                      <p className="text-xs text-muted-foreground">
                                        You cannot modify your own role
                                      </p>
                                    )}
                                  </div>
                                  <div className="space-y-2">
                                    <Label htmlFor="edit-password">New Password</Label>
                                    <Input
                                      id="edit-password"
                                      type="password"
                                      placeholder="Leave blank to keep current password"
                                      value={editForm.password}
                                      onChange={(e) =>
                                        setEditForm({ ...editForm, password: e.target.value })
                                      }
                                    />
                                    <p className="text-xs text-muted-foreground">
                                      Minimum 6 characters. Leave blank to keep current password.
                                    </p>
                                  </div>
                                </div>
                                <DialogFooter>
                                  <Button
                                    variant="outline"
                                    onClick={() => handleDialogClose(false)}
                                  >
                                    Cancel
                                  </Button>
                                  <Button
                                    onClick={handleEditSubmit}
                                    disabled={updateUserMutation.isPending}
                                  >
                                    {updateUserMutation.isPending ? "Saving..." : "Save Changes"}
                                  </Button>
                                </DialogFooter>
                              </DialogContent>
                            </Dialog>

                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={user.id === currentUser?.id}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will permanently delete the user <strong>{user.username}</strong> and all their
                                    associated data. This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => deleteUserMutation.mutate(user.id)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    Delete User
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-sm text-muted-foreground">No users found</p>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </>
  );
}
