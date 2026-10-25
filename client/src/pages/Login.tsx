import { useState } from "react";
import { IIVLogo } from "@/components/IIVLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";

export function LoginPage() {
  const { login, loginMode } = useAuth();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      if (loginMode === "users") {
        await login({ username: username.trim(), password });
      } else {
        await login({ name: name.trim(), password });
      }
    } catch (err: any) {
      setError(err?.message || "Login failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm rounded-lg border bg-card text-card-foreground shadow-lg p-6 space-y-6">
        <div className="flex flex-col items-center text-center gap-3">
          <IIVLogo size={48} className="text-primary" />
          <div>
            <h1 className="text-xl font-bold tracking-tight">IIV Intelligence Portal</h1>
            <p className="text-sm text-muted-foreground mt-1">Sign in to view companies and evaluations.</p>
          </div>
        </div>
        <form className="space-y-4" onSubmit={onSubmit}>
          {loginMode === "users" ? (
            <div className="space-y-1.5">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                name="username"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                data-testid="login-username"
              />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="name">Your name</Label>
              <Input
                id="name"
                name="name"
                autoComplete="name"
                placeholder="How scores should be attributed"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                data-testid="login-name"
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              data-testid="login-password"
            />
          </div>
          {error && (
            <p className="text-sm text-destructive" role="alert" data-testid="login-error">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={pending} data-testid="login-submit">
            {pending ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </div>
    </div>
  );
}
