"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckIcon, CopyIcon, KeyRoundIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import { TableEmptyRow, TableToolbar } from "@/components/table-toolbar";
import { TablePagination } from "@/components/table-pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useTablePagination } from "@/hooks/use-table-pagination";
import { useSession } from "@/lib/auth-client";
import { queryKeys } from "@/lib/query-keys";
import { filterByQuery } from "@/lib/table-filter";

import {
  createUserAction,
  fetchUsersAction,
  removeUserAction,
  resetUserPasswordAction,
  setUserRoleAction,
} from "./actions";

const ROLE_ITEMS = [
  { value: "user", label: "Attendant" },
  { value: "admin", label: "Admin" },
];
const CREATE_ROLE_ITEMS = ROLE_ITEMS;

function roleValue(user) {
  return user.role === "admin" ? "admin" : "user";
}

function CopyPasswordButton({ password }) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      toast.success("Password copied.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy — select and copy it manually.");
    }
  }

  return (
    <Button type="button" variant="outline" onClick={onCopy}>
      {copied ? <CheckIcon /> : <CopyIcon />}
      {copied ? "Copied" : "Copy password"}
    </Button>
  );
}

function IssuedPasswordDialog({ issued, onClose }) {
  if (!issued) return null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {issued.kind === "reset" ? "Temporary password reset" : "User created"}
          </DialogTitle>
          <DialogDescription>
            Share this password with {issued.name || issued.email} now. It will not be shown
            again. They must change it the first time they sign in.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Email</Label>
            <Input readOnly value={issued.email} />
          </div>
          <div className="grid gap-1.5">
            <Label>Temporary password</Label>
            <Input readOnly value={issued.password} className="font-mono tracking-wide" />
          </div>
        </div>
        <DialogFooter>
          <CopyPasswordButton password={issued.password} />
          <Button type="button" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function UsersTable({ initialUsers }) {
  const queryClient = useQueryClient();
  const { data: sessionData } = useSession();
  const currentUserId = sessionData?.user?.id;

  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [createRole, setCreateRole] = useState("user");
  const [busyId, setBusyId] = useState(null);
  const [issued, setIssued] = useState(null);

  const { data: users } = useQuery({
    queryKey: queryKeys.users,
    queryFn: fetchUsersAction,
    initialData: initialUsers,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.users });

  const createMutation = useMutation({
    mutationFn: (formData) => createUserAction(formData),
    onSuccess: async (res) => {
      if (res.error) {
        toast.error(res.error);
        return;
      }
      await refresh();
      setCreating(false);
      setIssued({
        kind: "create",
        name: res.user?.name,
        email: res.user?.email,
        password: res.temporaryPassword,
      });
    },
    onError: () => toast.error("Something went wrong. Try again."),
  });

  const resetMutation = useMutation({
    mutationFn: ({ id }) => resetUserPasswordAction(id),
    onSettled: () => setBusyId(null),
    onSuccess: async (res, { user }) => {
      if (res.error) {
        toast.error(res.error);
        return;
      }
      await refresh();
      setIssued({
        kind: "reset",
        name: user.name,
        email: user.email,
        password: res.temporaryPassword,
      });
    },
    onError: () => toast.error("Something went wrong. Try again."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => removeUserAction(id),
    onSettled: () => setBusyId(null),
    onSuccess: async (res) => {
      if (res.error) {
        toast.error(res.error);
        return;
      }
      await refresh();
      toast.success("User deleted.");
    },
    onError: () => toast.error("Something went wrong. Try again."),
  });

  const roleMutation = useMutation({
    mutationFn: ({ id, role }) => setUserRoleAction(id, role),
    onSettled: () => setBusyId(null),
    onSuccess: async (res, { role }) => {
      if (res.error) {
        toast.error(res.error);
        return;
      }
      await refresh();
      toast.success(role === "admin" ? "User promoted to admin." : "User set as attendant.");
    },
    onError: () => toast.error("Something went wrong. Try again."),
  });

  const filtered = useMemo(
    () =>
      filterByQuery(users, search, (u) => `${u.name} ${u.email} ${u.role ?? ""}`),
    [users, search],
  );
  const { page, paginated, setPage, totalItems, totalPages, pageSize } =
    useTablePagination(filtered);

  function onCreate(event) {
    event.preventDefault();
    createMutation.mutate(new FormData(event.currentTarget));
  }

  function onReset(user) {
    if (
      !window.confirm(
        `Reset the password for ${user.name}? Their current sessions will be signed out.`,
      )
    ) {
      return;
    }
    setBusyId(user.id);
    resetMutation.mutate({ id: user.id, user });
  }

  function onDelete(user) {
    if (!window.confirm(`Delete ${user.name} (${user.email})? This cannot be undone.`)) {
      return;
    }
    setBusyId(user.id);
    deleteMutation.mutate(user.id);
  }

  function onSetRole(user, role) {
    if (role === roleValue(user)) return;

    const label = role === "admin" ? "admin" : "attendant";
    const extra =
      role === "user" && user.role === "admin"
        ? " Their admin sessions will be signed out."
        : "";
    if (!window.confirm(`Make ${user.name} an ${label}?${extra}`)) {
      return;
    }

    setBusyId(user.id);
    roleMutation.mutate({ id: user.id, role });
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button
          onClick={() => {
            setCreateRole("user");
            setCreating(true);
          }}
        >
          <PlusIcon />
          New user
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <TableToolbar
          search={search}
          searchPlaceholder="Search users…"
          onSearchChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
        />
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableEmptyRow
                  colSpan={5}
                  message={search ? "No users match your search." : "No users yet."}
                />
              ) : (
                paginated.map((user) => {
                  const isSelf = user.id === currentUserId;
                  const currentRole = roleValue(user);
                  return (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium text-foreground">{user.name}</TableCell>
                      <TableCell className="text-muted-foreground">{user.email}</TableCell>
                      <TableCell>
                        {isSelf ? (
                          <Badge variant="default">Admin</Badge>
                        ) : (
                          <Select
                            value={currentRole}
                            items={ROLE_ITEMS}
                            onValueChange={(role) => onSetRole(user, role)}
                            disabled={busyId === user.id || roleMutation.isPending}
                          >
                            <SelectTrigger
                              className="h-8 w-[8.5rem]"
                              aria-label={`Role for ${user.name}`}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="user">Attendant</SelectItem>
                              <SelectItem value="admin">Admin</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>
                      <TableCell>
                        {user.mustChangePassword ? (
                          <Badge variant="outline">Must change password</Badge>
                        ) : (
                          <span className="text-muted-foreground">Active</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {isSelf ? (
                          <span className="text-xs text-muted-foreground">You</span>
                        ) : currentRole === "admin" ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Reset password for ${user.name}`}
                              disabled={busyId === user.id}
                              onClick={() => onReset(user)}
                            >
                              <KeyRoundIcon className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Delete ${user.name}`}
                              disabled={busyId === user.id}
                              onClick={() => onDelete(user)}
                            >
                              <Trash2Icon className="size-4 text-destructive" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
        <TablePagination
          page={page}
          pageSize={pageSize}
          totalItems={totalItems}
          totalPages={totalPages}
          onPageChange={setPage}
        />
      </div>

      <Dialog
        open={creating}
        onOpenChange={(open) => {
          if (!open) setCreating(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New user</DialogTitle>
            <DialogDescription>
              Choose Attendant for selling and receiving stock, or Admin for full shop access. A
              temporary password is generated for you to share; they set their own on first sign-in.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onCreate} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="user-name">Name</Label>
              <Input id="user-name" name="name" required autoComplete="off" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="user-email">Email</Label>
              <Input
                id="user-email"
                name="email"
                type="email"
                required
                autoComplete="off"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="user-role">Role</Label>
              <Select value={createRole} onValueChange={setCreateRole} items={CREATE_ROLE_ITEMS}>
                <SelectTrigger id="user-role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CREATE_ROLE_ITEMS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input type="hidden" name="role" value={createRole} />
              <p className="text-xs text-muted-foreground">
                Admins can manage stock, users, and accounts. Attendants sell, log expenses, and
                receive shop stock.
              </p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreating(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating…" : "Create & generate password"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <IssuedPasswordDialog issued={issued} onClose={() => setIssued(null)} />
    </>
  );
}
