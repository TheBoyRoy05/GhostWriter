import { useState } from "react";
import { Copy, Download, FileText, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MOCK_LATEX } from "@/lib/mock-latex";

const KEYWORDS = ["\\\\documentclass", "\\\\usepackage", "\\\\begin", "\\\\end", "\\\\section", "\\\\textbf", "\\\\textit", "\\\\item", "\\\\href", "\\\\titleformat", "\\\\setlength", "\\\\LARGE", "\\\\bfseries", "\\\\titlerule", "\\\\hfill", "\\\\quad", "\\\\\\\\"];

const highlightLatex = (code: string) => {
  const lines = code.split("\n");
  return lines.map((line, i) => {
    // Comments
    if (line.trimStart().startsWith("%")) {
      return (
        <div key={i} className="text-terminal-dim italic">
          {line}
        </div>
      );
    }

    // Highlight commands
    let parts: React.ReactNode[] = [line];
    
    // Simple keyword highlighting
    const hasCommand = /\\[a-zA-Z]+/.test(line);
    if (hasCommand) {
      return (
        <div key={i}>
          {line.split(/(\\[a-zA-Z]+\*?)/).map((part, j) => {
            if (/^\\[a-zA-Z]+\*?$/.test(part)) {
              return <span key={j} className="text-terminal-cyan">{part}</span>;
            }
            // Highlight braces content
            return <span key={j}>{part.split(/(\{[^}]*\})/).map((seg, k) => {
              if (seg.startsWith("{") && seg.endsWith("}")) {
                return <span key={k} className="text-terminal-amber">{seg}</span>;
              }
              return seg;
            })}</span>;
          })}
        </div>
      );
    }

    return <div key={i}>{line || "\u00A0"}</div>;
  });
};

const LatexOutput = () => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(MOCK_LATEX);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([MOCK_LATEX], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "resume_tailored.tex";
    a.click();
    URL.revokeObjectURL(url);
  };

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
            resume_tailored.tex
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopy}
              className="h-7 px-2.5 text-xs font-mono text-muted-foreground hover:text-foreground"
            >
              {copied ? <Check size={12} className="mr-1.5 text-primary" /> : <Copy size={12} className="mr-1.5" />}
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDownload}
              className="h-7 px-2.5 text-xs font-mono text-muted-foreground hover:text-foreground"
            >
              <Download size={12} className="mr-1.5" />
              .tex
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled
              className="h-7 px-2.5 text-xs font-mono opacity-40"
            >
              Export PDF (Coming Soon)
            </Button>
          </div>
        </div>

        {/* Code block */}
        <div className="p-4 overflow-x-auto max-h-[500px] overflow-y-auto scanline">
          <pre className="text-xs font-mono leading-5 text-foreground/90">
            {highlightLatex(MOCK_LATEX)}
          </pre>
        </div>
      </div>
    </div>
  );
};

export default LatexOutput;
