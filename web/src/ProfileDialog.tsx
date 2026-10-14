import { useState, type FormEvent } from "react";
import { UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Profile = Record<string, string | boolean | undefined>;

const FIELDS = [
  { key: "name", label: "Name", type: "text", autoComplete: "name" },
  { key: "email", label: "Email", type: "email", autoComplete: "email" },
  { key: "phone", label: "Phone", type: "tel", autoComplete: "tel" },
  { key: "location", label: "Location", type: "text", autoComplete: "address-level2" },
  { key: "personal_website", label: "Website", type: "url", autoComplete: "url", placeholder: "https://" },
  { key: "github", label: "GitHub", type: "url", placeholder: "https://github.com/" },
  { key: "linkedin", label: "LinkedIn", type: "url", placeholder: "https://www.linkedin.com/in/" },
  { key: "hobbies", label: "Hobbies", type: "text" },
] as const;

export default function ProfileDialog() {
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<Profile>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function load(next: boolean) {
    setOpen(next);
    if (!next) return;
    setError("");
    const res = await fetch("/api/profile");
    if (res.ok) setProfile(await res.json());
    else setError("Could not load profile");
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      if (!res.ok) return setError((await res.json()).error);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  const set = (key: string, value: string | boolean) => setProfile((p) => ({ ...p, [key]: value }));

  return (
    <Dialog open={open} onOpenChange={load}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <UserRound aria-hidden />
          Profile
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={save} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Profile</DialogTitle>
            <DialogDescription>Contact details for the resume header. LinkedIn scraping fills the rest.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            {FIELDS.map(({ key, label, ...input }) => (
              <div key={key} className="grid gap-1.5">
                <Label htmlFor={`profile-${key}`}>{label}</Label>
                <Input
                  id={`profile-${key}`}
                  {...input}
                  value={(profile[key] as string | undefined) ?? ""}
                  onChange={(e) => set(key, e.target.value)}
                />
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="profile-citizenship"
              checked={profile.citizenship === true}
              onCheckedChange={(checked) => set("citizenship", checked === true)}
            />
            <Label htmlFor="profile-citizenship">Show "U.S. Citizen" in the header</Label>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
