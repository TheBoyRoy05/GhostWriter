import { useState } from "react";
import Header from "@/components/Header";
import JobInput from "@/components/JobInput";
import LatexOutput from "@/components/LatexOutput";
import { supabase, supabaseUrl, supabaseAnonKey } from "@/utils/supabase";
import { useAuthStore } from "@/stores/authStore";
import { useToast } from "@/hooks/use-toast";

export interface MatcherResult {
  result?: string;
  error?: string;
}

const Index = () => {
  const [jobDescription, setJobDescription] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [showOutput, setShowOutput] = useState(false);
  const [matcherResult, setMatcherResult] = useState<MatcherResult | null>(null);
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const { toast } = useToast();

  const resume = profile?.resume as { experiences?: unknown[]; projects?: unknown[]; skills?: unknown[] } | undefined;
  const hasResume =
    (Array.isArray(resume?.experiences) && resume.experiences.length > 0) ||
    (Array.isArray(resume?.projects) && resume.projects.length > 0) ||
    (Array.isArray(resume?.skills) && resume.skills.length > 0);

  const handleGenerate = async () => {
    if (!jobDescription.trim()) return;
    setIsGenerating(true);
    setShowOutput(false);
    try {
      // Send only user_id to avoid large payloads (resume fetched server-side)
      if (!user?.id) {
        toast({ title: "Sign in required", description: "Please sign in to generate a tailored resume.", variant: "destructive" });
        return;
      }
      const body = { job_description: jobDescription, user_id: user.id };
      console.log("Matcher request body:", body);

      const matcherUrl = import.meta.env.DEV
        ? `${window.location.origin}/api/functions/v1/matcher`
        : `${supabaseUrl}/functions/v1/matcher`;

      const res = await fetch(matcherUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: supabaseAnonKey ?? "",
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        console.error("Matcher error:", data);
        setMatcherResult({ error: data.error ?? "Request failed" });
      } else {
        console.log("Matcher output:", data);
        setMatcherResult({ result: data.result });
      }
    } catch (err) {
      console.error("Matcher error:", err);
    } finally {
      setIsGenerating(false);
      setShowOutput(true);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 flex items-start justify-center px-4 py-10">
        <div className="w-full max-w-3xl space-y-8">
          {/* Main card */}
          <div className="rounded-xl border border-border bg-card p-6 md:p-8 space-y-8 terminal-border">
            <div className="space-y-1">
              <p className="text-xs font-mono text-muted-foreground">
                <span className="text-primary">$</span> ghost-writer --tailor resume.tex --target &lt;job_description&gt;
              </p>
            </div>

            <JobInput
              jobDescription={jobDescription}
              setJobDescription={setJobDescription}
              onGenerate={handleGenerate}
              isGenerating={isGenerating}
              hasResume={hasResume}
            />

            {showOutput && (
              <div className="pt-4 border-t border-border">
                <LatexOutput matcherResult={matcherResult} profile={profile} jobDescription={jobDescription} />
              </div>
            )}
          </div>

          {/* Footer */}
          <p className="text-center text-xs font-mono text-muted-foreground">
            GhostWriter v0.1 — tailor your resume, not your skills
          </p>
        </div>
      </main>
    </div>
  );
};

export default Index;
