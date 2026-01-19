import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PrimaryButton } from '../components/Buttons';
import { useAuth } from '../auth';
import { useTheme } from '../lib/theme';
import logoDark from '../assets/trivia_ops_logo_dark.png';
import logoLight from '../assets/trivia_ops_logo_light.png';

export function LoginPage() {
  const { theme } = useTheme();
  const logo = theme === 'light' ? logoLight : logoDark;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const auth = useAuth();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const result = await auth.login(email, password);
    setLoading(false);
    if (result.ok) {
      navigate('/dashboard');
    } else {
      setError(result.message ?? 'Login failed');
    }
  };

  return (
    <div className="min-h-screen bg-bg text-text flex items-center justify-center px-4">
      <div className="w-full max-w-md border-2 border-border bg-panel p-6">
        <img src={logo} alt="Trivia Ops" className="h-16 w-auto" />
        <h1 className="mt-4 text-2xl font-display uppercase tracking-[0.35em]">Login</h1>
        <p className="mt-2 text-xs uppercase tracking-[0.2em] text-muted">
          Industrial Control Access
        </p>
        <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit}>
          <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="h-10 px-3"
            />
          </label>
          <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
            Password
            <input
              type="password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="h-10 px-3"
            />
          </label>
          {error && (
            <div className="border-2 border-danger bg-panel2 px-3 py-2 text-xs uppercase tracking-[0.2em] text-danger">
              {error}
            </div>
          )}
          <PrimaryButton type="submit" disabled={loading}>
            {loading ? 'Authorizing' : 'Enter Ops'}
          </PrimaryButton>
        </form>
        <div className="mt-6 border-t-2 border-border pt-4">
          <div className="text-xs font-display uppercase tracking-[0.3em] text-muted">Enter Event Code</div>
          <div className="mt-3 flex flex-col gap-3">
            <input
              className="h-10 px-3"
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="ABC123"
            />
            <PrimaryButton
              type="button"
              onClick={() => {
                if (code.trim()) navigate(`/play/${code.trim().toUpperCase()}`);
              }}
            >
              Enter Event
            </PrimaryButton>
          </div>
        </div>
      </div>
    </div>
  );
}
