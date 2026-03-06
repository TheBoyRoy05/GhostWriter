import { Link } from "react-router-dom";
import { ChevronDown, Code, LogIn, LogOut, User, UserPlus } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const Header = () => {
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const signOut = useAuthStore((s) => s.signOut);

  const displayName = profile?.name || user?.email?.split("@")[0] || "User";
  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <header className="w-full border-b border-border py-4 px-6">
      <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
        <Link to="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
          <div className="p-2 rounded-md bg-primary/10 border border-primary/20">
            <Code size={20} className="text-primary" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            GhostWriter
          </h1>
          <span className="text-xs font-mono text-muted-foreground ml-1 mt-0.5">v0.1</span>
        </Link>
        <nav className="flex items-center gap-2">
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2 px-2 group">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="text-xs bg-primary/10 text-primary group-hover:text-black/80 group-hover:bg-black/20 transition-colors">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium hidden sm:inline max-w-[120px] truncate">
                    {displayName}
                  </span>
                  <ChevronDown className="size-4 text-muted-foreground hidden sm:block" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem asChild>
                  <Link to="/profile" className="flex items-center cursor-pointer">
                    <User className="size-4 mr-2" />
                    Profile
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => signOut()}
                  className="text-destructive focus:text-destructive cursor-pointer"
                >
                  <LogOut className="size-4 mr-2" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
