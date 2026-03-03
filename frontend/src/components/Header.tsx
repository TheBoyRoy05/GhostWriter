import { Link } from "react-router-dom";
import { Code, LogIn, LogOut, UserPlus } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { Button } from "@/components/ui/button";

const Header = () => {
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const signOut = useAuthStore((s) => s.signOut);

  return (
    <header className="w-full border-b border-border py-4 px-6">
      <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
        <Link to="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
          <div className="p-2 rounded-md bg-primary/10 border border-primary/20">
            <Code size={20} className="text-primary" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            ResumeEngine
          </h1>
          <span className="text-xs font-mono text-muted-foreground ml-1 mt-0.5">v0.1</span>
        </Link>
        <nav className="flex items-center gap-2">
          {user ? (
            <>
              {profile?.name && (
                <span className="text-sm text-muted-foreground hidden sm:inline">
                  {profile.name}
                </span>
              )}
              <Button variant="ghost" size="sm" onClick={() => signOut()}>
                <LogOut className="size-4 mr-1" />
                Sign out
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/sign-in">
                  <LogIn className="size-4 mr-1" />
                  Sign in
                </Link>
              </Button>
              <Button size="sm" asChild>
                <Link to="/sign-up">
                  <UserPlus className="size-4 mr-1" />
                  Sign up
                </Link>
              </Button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
};

export default Header;
