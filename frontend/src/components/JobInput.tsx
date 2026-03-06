import { useState } from "react";
import { Link as LinkIcon, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useFetchJobDescription } from "@/hooks/useFetchJobDescription";

interface JobInputProps {
  jobDescription: string;
  setJobDescription: (v: string) => void;
  onGenerate: () => void;
  isGenerating: boolean;
  hasResume?: boolean;
}

function isValidJobUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    return (
      host.includes(".myworkdayjobs.com") ||
      host.includes(".myworkdaysite.com") ||
      host.includes("workday.com")
    );
  } catch {
    return false;
  }
}

const JobInput = ({ jobDescription, setJobDescription, onGenerate, isGenerating, hasResume = true }: JobInputProps) => {
  const [url, setUrl] = useState("");
  const [showManual, setShowManual] = useState(false);
  const { toast } = useToast();
  const { isFetching, fetchJobDescription } = useFetchJobDescription();
  const hasValidLink = isValidJobUrl(url);

  const handleFetch = async () => {
    const result = await fetchJobDescription(url);
    
    if (result.success) {
      const text = result.title
        ? `Job Title: ${result.title}\n\n${result.description}`
        : result.description;
      setJobDescription(text);
      setShowManual(true);
      toast({
        title: "Job description fetched",
        description: result.title ? `${result.title} — review and edit if needed.` : "Review and edit if needed.",
      });
    } else {
      setShowManual(true);
      toast({
        title: "Could not fetch URL",
        description: "error" in result ? result.error : "Unknown error",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-mono text-primary">01</span>
        <h2 className="text-sm font-medium text-foreground">Job Description</h2>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <LinkIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste job posting URL here..."
            className="w-full rounded-md border border-input bg-secondary pl-10 pr-4 py-2.5 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50 transition-colors"
          />
        </div>
        <Button
          onClick={handleFetch}
          disabled={!hasValidLink || isFetching}
          variant={hasValidLink ? "default" : "secondary"}
          className="font-mono text-xs shrink-0"
        >
          {isFetching ? <Loader2 size={14} className="animate-spin mr-1.5" /> : null}
          {isFetching ? "..." : "Fetch"}
        </Button>
      </div>

      {!showManual && (
        <button
          onClick={() => setShowManual(true)}
          className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronDown size={12} />
          Paste manually
        </button>
      )}

      {showManual && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setShowManual(false)}
              className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronUp size={12} />
              Collapse
            </button>
          </div>
          <textarea
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            rows={8}
            placeholder="Paste the full job description here..."
            className="w-full rounded-md border border-input bg-secondary p-4 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50 transition-colors resize-y leading-relaxed"
          />
        </div>
      )}

      <Button
        onClick={onGenerate}
        disabled={isGenerating || jobDescription.trim().length < 200 || !hasResume}
        className="w-full font-mono text-sm mt-2 glow-green"
      >
        {isGenerating ? (
          <>
            <Loader2 size={14} className="animate-spin mr-2" />
            Compiling LaTeX...
          </>
        ) : (
          "Generate Tailored Resume"
        )}
      </Button>
      {!hasResume && (
        <p className="text-xs text-muted-foreground mt-2">
          Add your resume via the LinkedIn scraper first.{" "}
          <Link to="/profile" className="text-primary hover:underline">
            Go to Profile → Connect Extension
          </Link>
        </p>
      )}
    </div>
  );
};

export default JobInput;
