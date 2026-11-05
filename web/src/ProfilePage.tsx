import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { request, sendJson } from "@/lib/api";
import Field from "./Field";

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

export default function ProfilePage() {
  // Stays undefined until loaded: the PUT replaces the whole profile, so saving a partial one wipes stored fields.
  const [profile, setProfile] = useState<Profile>();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    request("/api/profile").then(async (result) => (result.ok ? setProfile(await result.res.json()) : setError(result.error)));
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    setError("");

    const result = await sendJson("PUT", "/api/profile", profile);
    setSaving(false);
    if (result.ok) toast("Profile saved");
    else setError(result.error);
  }

  const set = (key: string, value: string | boolean) => setProfile((p) => p && { ...p, [key]: value });

  return (
    <form onSubmit={save} className="mx-auto my-6 grid w-full max-w-5xl gap-6 rounded-md border bg-panel p-6">
      <header className="grid gap-1">
        <h1 className="text-2xl font-semibold">Profile</h1>
        <p className="max-w-[70ch] text-dim">
          Contact details for the resume header. Your experience comes from your LinkedIn profile, read by the extension.
        </p>
      </header>
      <fieldset disabled={!profile} className="grid gap-6">
        <div className="grid grid-cols-2 gap-4">
          {FIELDS.map(({ key, label, ...input }) => (
            <Field key={key} id={`profile-${key}`} label={label}>
              <Input
                id={`profile-${key}`}
                {...input}
                value={(profile?.[key] as string | undefined) ?? ""}
                onChange={(e) => set(key, e.target.value)}
              />
            </Field>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="profile-citizenship"
            checked={profile?.citizenship === true}
            onCheckedChange={(checked) => set("citizenship", checked === true)}
          />
          <Label htmlFor="profile-citizenship">Show "U.S. Citizen" in the header</Label>
        </div>
        {error && (
          <p role="alert" className="text-sm text-fault">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" className="justify-self-start" disabled={saving}>
          {saving ? "Saving…" : "Save profile"}
        </Button>
      </fieldset>
    </form>
  );
}
