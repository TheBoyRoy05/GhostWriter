import { useState, useMemo, useEffect } from "react";
import { Copy, Download, FileText, Check, Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildLatexFromMatcherResult, type MatcherJsonResult } from "@/lib/latex-builder";
import { buildRolesStoragePath, buildResumeFileName, parseJobUrl } from "@/lib/job-url";
import { supabase } from "@/lib/supabase";
import useRoleStore from "@/stores/roleStore";
import type { MatcherResult } from "@/pages/Index";
import type { Profile } from "@/types/profile";

function parseJobTitle(jobDescription: string): string | null {
  const match = jobDescription.match(/^Job Title:\s*(.+?)(?:\n\n|$)/s);
  return match ? match[1].trim() : null;
}

interface LatexOutputProps {
  matcherResult: MatcherResult | null;
  profile: Profile | null;
  userId?: string | null;
}

const LatexOutput = ({ matcherResult, profile, userId = null }: LatexOutputProps) => {
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const { description, link, company, roleId, resumeTex, setResumeTex } = useRoleStore();

  const latexContent = useMemo(() => {
    if (!matcherResult?.result) {
      return "% Run Generate to create a tailored resume";
    }
    try {
      const parsed = JSON.parse(matcherResult.result) as MatcherJsonResult;
      const resume = profile?.resume as
        | {
            education?: Array<{
              school?: string;
              degree?: string;
              start?: string;
              end?: string;
              grade?: string | null;
            }>;
          }
        | undefined;
      const jobTitle = parseJobTitle(description);
      return buildLatexFromMatcherResult(parsed, profile, resume, jobTitle);
    } catch {
      return "% Failed to parse matcher result";
    }
  }, [matcherResult, profile, description]);

  // Sync editable content when new latex is generated, and auto-save to storage
  useEffect(() => {
    if (latexContent && !latexContent.startsWith("% Run Generate")) {
      setResumeTex(latexContent);
      // Auto-save on first generation (use parsed values if editable ones not yet synced)
      if (userId) {
        const { company: c, roleId: r } = parseJobUrl(link);
        const fileName = buildResumeFileName(profile?.name);
        const path = buildRolesStoragePath(userId, company || c, roleId || r, fileName);
        supabase.storage
          .from("Roles")
          .upload(path, latexContent, { contentType: "text/plain", upsert: true })
          .then(({ error }) => {
            if (error) setSaveError(error.message);
          });
      }
    }
  }, [latexContent, userId, company, roleId, link, profile?.name, setResumeTex]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(resumeTex);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([resumeTex], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = buildResumeFileName(profile?.name);
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSave = async () => {
    if (!userId) {
      setSaveError("Sign in to save");
      return;
    }
    setSaveError(null);
    setSaving(true);
    try {
      const fileName = buildResumeFileName(profile?.name);
      const path = buildRolesStoragePath(userId, company, roleId, fileName);
      const { error } = await supabase.storage.from("Roles").upload(path, resumeTex, {
        contentType: "text/plain",
        upsert: true,
      });
      if (error) throw error;
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const hasContent = resumeTex && !resumeTex.startsWith("% Run Generate");
  const canSave = hasContent && userId;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-mono text-primary">02</span>
        <h2 className="text-sm font-medium text-foreground">Output</h2>
      </div>

      <div className="rounded-lg border border-border bg-muted/50 overflow-hidden terminal-border">
        {/* Toolbar */}
        <div className="flex items-center justify-between border-b border-border px-4 py-2 bg-secondary/50">
          <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
            <FileText size={12} />
            {buildResumeFileName(profile?.name)}
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopy}
              disabled={!hasContent}
              className="h-7 px-2.5 text-xs font-mono text-muted-foreground hover:text-foreground"
            >
              {copied ? (
                <Check size={12} className="mr-1.5 text-primary" />
              ) : (
                <Copy size={12} className="mr-1.5" />
              )}
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDownload}
              disabled={!hasContent}
              className="h-7 px-2.5 text-xs font-mono text-muted-foreground hover:text-foreground"
            >
              <Download size={12} className="mr-1.5" />
              .tex
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSave}
              disabled={!canSave || saving}
              className="h-7 px-2.5 text-xs font-mono text-muted-foreground hover:text-foreground"
            >
              {saving ? (
                <Loader2 size={12} className="mr-1.5 animate-spin" />
              ) : (
                <Save size={12} className="mr-1.5" />
              )}
              Save
            </Button>
          </div>
        </div>

        {saveError && (
          <div className="px-4 py-2 text-xs text-destructive bg-destructive/10 border-b border-border">
            {saveError}
          </div>
        )}

        {/* Editable content */}
        <div className="p-4 overflow-x-auto max-h-[500px] overflow-y-auto scanline">
          {matcherResult?.error ? (
            <p className="text-xs font-mono text-destructive">{matcherResult.error}</p>
          ) : (
            <textarea
              value={resumeTex}
              onChange={(e) => setResumeTex(e.target.value)}
              placeholder="% Run Generate to create a tailored resume"
              className="w-full min-h-[300px] text-xs font-mono leading-5 text-foreground/90 bg-transparent border-none outline-none resize-none placeholder:text-muted-foreground"
              spellCheck={false}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default LatexOutput;
