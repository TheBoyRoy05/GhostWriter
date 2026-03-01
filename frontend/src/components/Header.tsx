import { Code } from "lucide-react";

const Header = () => (
  <header className="w-full border-b border-border py-4 px-6">
    <div className="max-w-4xl mx-auto flex items-center gap-3">
      <div className="p-2 rounded-md bg-primary/10 border border-primary/20">
        <Code size={20} className="text-primary" />
      </div>
      <h1 className="text-xl font-semibold tracking-tight text-foreground">
        Overfit
      </h1>
      <span className="text-xs font-mono text-muted-foreground ml-1 mt-0.5">v0.1</span>
    </div>
  </header>
);

export default Header;
