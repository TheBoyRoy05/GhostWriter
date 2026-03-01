import { useState } from "react";
import Header from "@/components/Header";
import JobInput from "@/components/JobInput";
import LatexOutput from "@/components/LatexOutput";

const Index = () => {
  const [jobDescription, setJobDescription] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [showOutput, setShowOutput] = useState(false);

  const handleGenerate = () => {
    setIsGenerating(true);
    setShowOutput(false);
    setTimeout(() => {
      setIsGenerating(false);
      setShowOutput(true);
    }, 2000);
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
                <span className="text-primary">$</span> overfit --tailor resume.tex --target &lt;job_description&gt;
              </p>
            </div>

            <JobInput
              jobDescription={jobDescription}
              setJobDescription={setJobDescription}
              onGenerate={handleGenerate}
              isGenerating={isGenerating}
            />

            {showOutput && (
              <div className="pt-4 border-t border-border">
                <LatexOutput />
              </div>
            )}
          </div>

          {/* Footer */}
          <p className="text-center text-xs font-mono text-muted-foreground">
            overfit v0.1 — tailor your resume, not your skills
          </p>
        </div>
      </main>
    </div>
  );
};

export default Index;
