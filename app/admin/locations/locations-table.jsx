"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PencilIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";

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
import { TableEmptyRow } from "@/components/table-toolbar";
import { queryKeys } from "@/lib/query-keys";

import {
  createLocationAction,
  fetchLocationsAction,
  renameLocationAction,
  updateLocationCurrencyAction,
} from "./actions";

export function LocationsTable({ initialLocations, attendantsByLocation = {} }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [creating, setCreating] = useState(false);
  const [role, setRole] = useState("branch");
  const [supplyHubId, setSupplyHubId] = useState("");

  const { data: locations } = useQuery({
    queryKey: queryKeys.locations,
    queryFn: fetchLocationsAction,
    initialData: initialLocations,
  });

  const hubs = (locations ?? []).filter((loc) => loc.isHub);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: queryKeys.locations });
  }

  const renameMutation = useMutation({
    mutationFn: ({ id, name: nextName, currency: nextCurrency }) =>
      Promise.all([
        renameLocationAction(id, nextName),
        updateLocationCurrencyAction(id, nextCurrency),
      ]).then(([renamed, currencyResult]) => currencyResult.error ? currencyResult : renamed),
    onSuccess: async (res) => {
      if (res.error) {
        toast.error(res.error);
        return;
      }
      await refresh();
      toast.success("Location saved.");
      setEditing(null);
    },
    onError: () => toast.error("Something went wrong. Try again."),
  });

  const createMutation = useMutation({
    mutationFn: (formData) => createLocationAction(formData),
    onSuccess: async (res) => {
      if (res.error) {
        toast.error(res.error);
        return;
      }
      await refresh();
      toast.success("Location added. Assign attendants on Users.");
      setCreating(false);
    },
    onError: () => toast.error("Something went wrong. Try again."),
  });

  function openRename(location) {
    setEditing(location);
    setName(location.name ?? "");
    setCurrency(location.currency || "USD");
  }

  function openCreate() {
    setRole("branch");
    setCurrency("ZAR");
    setName("");
    setSupplyHubId(hubs[0]?.id ?? "");
    setCreating(true);
  }

  function onRename(event) {
    event.preventDefault();
    if (!editing) return;
    renameMutation.mutate({ id: editing.id, name, currency });
  }

  function onCreate(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.set("role", role);
    formData.set("currency", currency);
    if (role === "branch") formData.set("supplyHubId", supplyHubId);
    createMutation.mutate(formData);
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={openCreate}>
          <PlusIcon />
          New location
        </Button>
      </div>
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-medium text-foreground">Shops</h2>
          <p className="text-xs text-muted-foreground">
            A branch receives stock from its supply hub. Hubs can also send units to each other.
            Assign attendants on Users.
          </p>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Currency</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Supplied by</TableHead>
                <TableHead>Attendants</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(locations ?? []).length === 0 ? (
                <TableEmptyRow colSpan={6} message="No locations yet." />
              ) : (
                (locations ?? []).map((location) => {
                  const hub = (locations ?? []).find((row) => row.id === location.supplyHubId);
                  const attendants = attendantsByLocation[location.id] ?? [];
                  return (
                    <TableRow key={location.id}>
                      <TableCell className="font-medium text-foreground">{location.name}</TableCell>
                      <TableCell className="tabular-nums">{location.currency || "USD"}</TableCell>
                      <TableCell>
                        {location.isHub ? (
                          <Badge variant="default">Hub</Badge>
                        ) : (
                          <Badge variant="outline">Branch</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {location.isHub ? "—" : hub?.name ?? "—"}
                      </TableCell>
                      <TableCell className="max-w-xs text-muted-foreground">
                        {attendants.length === 0
                          ? "None yet"
                          : attendants.map((person) => person.name).join(", ")}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Edit ${location.name}`}
                          onClick={() => openRename(location)}
                        >
                          <PencilIcon className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New location</DialogTitle>
            <DialogDescription>
              Johannesburg is a hub. Cape Town is a branch supplied by Johannesburg. Stock starts at zero.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onCreate} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="new-location-name">Name</Label>
              <Input id="new-location-name" name="name" required autoComplete="off" />
            </div>
            <div className="grid gap-2">
              <Label>Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="ZAR">ZAR</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Role</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hub">Hub</SelectItem>
                  <SelectItem value="branch">Branch</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {role === "branch" ? (
              <div className="grid gap-2">
                <Label>Supplied by</Label>
                <Select value={supplyHubId} onValueChange={setSupplyHubId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choose a hub" />
                  </SelectTrigger>
                  <SelectContent>
                    {hubs.map((hub) => (
                      <SelectItem key={hub.id} value={hub.id}>
                        {hub.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreating(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Saving…" : "Add location"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit location</DialogTitle>
            <DialogDescription>
              Currency locks after this shop records a sale or an expense.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onRename} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="location-name">Name</Label>
              <Input
                id="location-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                autoComplete="off"
              />
            </div>
            <div className="grid gap-2">
              <Label>Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="ZAR">ZAR</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={renameMutation.isPending || !name.trim()}>
                {renameMutation.isPending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
