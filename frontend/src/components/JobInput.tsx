import { useState } from "react";
import { Link, Loader2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useFetchJobDescription } from "@/hooks/useFetchJobDescription";

interface JobInputProps {
  jobDescription: string;
  setJobDescription: (v: string) => void;
  onGenerate: () => void;
  isGenerating: boolean;
}

const JobInput = ({ jobDescription, setJobDescription, onGenerate, isGenerating }: JobInputProps) => {
  const [url, setUrl] = useState("");
  const [showManual, setShowManual] = useState(false);
  const { toast } = useToast();
  const { isFetching, fetchJobDescription } = useFetchJobDescription();

  const handleFetch = async () => {
    const result = await fetchJobDescription(url);
    
    if (result.success) {
      setJobDescription(result.description);
      setShowManual(true);
      toast({
        title: "Job description fetched",
        description: "Review and edit if needed.",
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
          <Link size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
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
          disabled={isFetching || !url.trim()}
          variant="secondary"
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
        disabled={isGenerating || !jobDescription.trim()}
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
    </div>
  );
};

export default JobInput;
