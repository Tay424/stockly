"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PencilIcon } from "lucide-react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableEmptyRow } from "@/components/table-toolbar";
import { queryKeys } from "@/lib/query-keys";

import { fetchLocationsAction, renameLocationAction } from "./actions";

export function LocationsTable({ initialLocations }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState("");

  const { data: locations } = useQuery({
    queryKey: queryKeys.locations,
    queryFn: fetchLocationsAction,
    initialData: initialLocations,
  });

  const renameMutation = useMutation({
    mutationFn: ({ id, name: nextName }) => renameLocationAction(id, nextName),
    onSuccess: async (res) => {
      if (res.error) {
        toast.error(res.error);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.locations });
      toast.success("Location renamed.");
      setEditing(null);
    },
    onError: () => toast.error("Something went wrong. Try again."),
  });

  function openRename(location) {
    setEditing(location);
    setName(location.name ?? "");
  }

  function onSubmit(event) {
    event.preventDefault();
    if (!editing) return;
    renameMutation.mutate({ id: editing.id, name });
  }

  return (
    <>
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-medium text-foreground">Branches</h2>
          <p className="text-xs text-muted-foreground">
            Harare is the hub; Gweru is the branch. Stock transfers move hub → branch via In
            transit.
          </p>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(locations ?? []).length === 0 ? (
                <TableEmptyRow colSpan={4} message="No locations seeded yet." />
              ) : (
                (locations ?? []).map((location) => (
                  <TableRow key={location.id}>
                    <TableCell className="font-medium text-foreground">{location.name}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {location.slug}
                    </TableCell>
                    <TableCell>
                      {location.isHub ? (
                        <Badge variant="default">Hub</Badge>
                      ) : (
                        <Badge variant="outline">Branch</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Rename ${location.name}`}
                        onClick={() => openRename(location)}
                      >
                        <PencilIcon className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename location</DialogTitle>
            <DialogDescription>
              Updates the display name for this branch and for users assigned to it.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} className="grid gap-4">
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
