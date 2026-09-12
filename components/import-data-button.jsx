"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UploadIcon } from "lucide-react";
import { toast } from "sonner";

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

export function ImportDataButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState(null);
  const [pending, setPending] = useState(false);

  function onOpenChange(next) {
    if (pending) return;
    setOpen(next);
    if (!next) setFile(null);
  }

  async function onImport() {
    if (!file) {
      toast.error("Choose a Stockly export JSON file.");
      return;
    }

    setPending(true);
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch("/api/admin/import", { method: "POST", body });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(data?.error || "Could not import data.");
        return;
      }

      const documents = data?.documents ?? 0;
      const collections = data?.collections ?? 0;
      toast.success(`Imported ${documents} records across ${collections} collections.`);
      setOpen(false);
      setFile(null);
      router.refresh();
    } catch {
      toast.error("Could not import data.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <UploadIcon />
        Import data
      </Button>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Import shop data</DialogTitle>
            <DialogDescription>
              Choose a Stockly export JSON file. Records are written with their original
              ids. Existing rows with those ids are replaced.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="shop-export-file">Export file</Label>
            <Input
              id="shop-export-file"
              type="file"
              accept=".json,application/json"
              disabled={pending}
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="button" onClick={onImport} disabled={pending || !file}>
              {pending ? "Importing…" : "Import"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
