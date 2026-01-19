import { useRef, useState } from 'react';
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
  const [code, setCode] = useState(['', '', '', '']);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hostOpen, setHostOpen] = useState(false);
  const codeRefs = useRef<Array<HTMLInputElement | null>>([]);
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
        <div className="mt-4">
          <div className="text-2xl font-display uppercase tracking-[0.35em]">Join Game</div>
          <div className="mt-2 text-xs uppercase tracking-[0.2em] text-muted">Enter Event Code</div>
          <div className="mt-3 flex flex-col gap-3">
            <div className="flex gap-2">
              {code.map((value, index) => (
                <input
                  key={`code-${index}`}
                  ref={(el) => {
                    codeRefs.current[index] = el;
                  }}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={1}
                  className="h-12 w-12 border-2 border-border bg-panel2 text-center text-lg font-display tracking-[0.2em]"
                  value={value}
                  onChange={(event) => {
                    const next = event.target.value.replace(/\D/g, '').slice(0, 1);
                    setCode((prev) => {
                      const updated = [...prev];
                      updated[index] = next;
                      if (updated.every((digit) => digit)) {
                        navigate(`/play/${updated.join('')}`);
                      }
                      return updated;
                    });
                    if (next && index < codeRefs.current.length - 1) {
                      codeRefs.current[index + 1]?.focus();
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Backspace' && !code[index] && index > 0) {
                      codeRefs.current[index - 1]?.focus();
                    }
                  }}
                  aria-label={`Event code digit ${index + 1}`}
                />
              ))}
            </div>
            <PrimaryButton
              type="button"
              onClick={() => {
                const value = code.join('');
                if (value.trim()) navigate(`/play/${value}`);
              }}
            >
              Enter Event
            </PrimaryButton>
          </div>
        </div>
        <div className="mt-6 border-t-2 border-border pt-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-2xl font-display uppercase tracking-[0.35em]">Host Login</div>
            <SecondaryButton type="button" onClick={() => setHostOpen((prev) => !prev)}>
              {hostOpen ? 'Hide' : 'Host Login'}
            </SecondaryButton>
          </div>
          {hostOpen && (
            <>
              <p className="mt-2 text-xs uppercase tracking-[0.2em] text-muted">Host Console Access</p>
              <form className="mt-4 flex flex-col gap-4" onSubmit={handleSubmit}>
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
