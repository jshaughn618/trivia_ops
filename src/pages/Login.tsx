import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PrimaryButton, SecondaryButton } from '../components/Buttons';
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
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinLoading, setJoinLoading] = useState(false);
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

  const sanitized = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const codeValue = code.join('');
  const codeReady = code.every((digit) => digit.length === 1);

  const attemptJoin = async (value: string) => {
    const normalized = sanitized(value);
    if (normalized.length !== 4 || joinLoading) return;
    setJoinError(null);
    setJoinLoading(true);
    const res = await api.publicEvent(normalized);
    setJoinLoading(false);
    if (res.ok) {
      navigate(`/play/${normalized}`);
      return;
    }
    setJoinError('Event code not found. Check the code and try again.');
    setCode(['', '', '', '']);
    codeRefs.current[0]?.focus();
  };

  useEffect(() => {
    codeRefs.current[0]?.focus();
  }, []);

  return (
    <div className="min-h-screen bg-bg text-text flex items-center justify-center px-4">
      <div className="w-full max-w-md border-2 border-border bg-panel p-6">
        <img src={logo} alt="Trivia Ops" className="h-16 w-auto" />
        <div className="mt-4">
          <div className="text-3xl font-display tracking-tight">Join game</div>
          <div className="mt-2 text-sm text-muted">Enter the 4-character code from your host</div>
          <div className="mt-1 text-xs text-muted">Tip: you can paste the full code.</div>
          <div className="mt-3 flex flex-col gap-3">
            <div className="flex justify-center gap-3">
              {code.map((value, index) => (
                <input
                  key={`code-${index}`}
                  ref={(el) => {
                    codeRefs.current[index] = el;
                  }}
                  inputMode="text"
                  pattern="[A-Za-z0-9]*"
                  maxLength={1}
                  className="h-16 w-16 border-2 border-strong bg-panel2 text-center text-2xl font-display tracking-[0.2em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
                  value={value}
                  onChange={(event) => {
                    const next = sanitized(event.target.value).slice(0, 1);
                    setCode((prev) => {
                      const updated = [...prev];
                      updated[index] = next;
                      if (updated.every((digit) => digit)) {
                        attemptJoin(updated.join(''));
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
                    if (event.key === 'Enter' && codeReady) {
                      attemptJoin(codeValue);
                    }
                  }}
                  onPaste={(event) => {
                    event.preventDefault();
                    const paste = sanitized(event.clipboardData.getData('text'));
                    if (!paste) return;
                    setCode((prev) => {
                      const updated = [...prev];
                      for (let i = 0; i < paste.length && index + i < updated.length; i += 1) {
                        updated[index + i] = paste[i];
                      }
                      if (updated.every((digit) => digit)) {
                        attemptJoin(updated.join(''));
                      }
                      return updated;
                    });
                    const nextIndex = Math.min(index + paste.length, codeRefs.current.length - 1);
                    codeRefs.current[nextIndex]?.focus();
                  }}
                  aria-label={`Event code digit ${index + 1}`}
                />
              ))}
            </div>
            {joinError && (
              <div className="border border-danger bg-panel2 px-3 py-2 text-xs text-danger-ink">
                {joinError}
              </div>
            )}
            <PrimaryButton
              type="button"
              onClick={() => {
                if (codeReady) attemptJoin(codeValue);
              }}
              disabled={!codeReady || joinLoading}
            >
              {joinLoading ? 'Checking…' : 'Join game'}
            </PrimaryButton>
          </div>
        </div>
        <div className="mt-6 border-t-2 border-border pt-4">
          <div className="flex items-center justify-between gap-3">
            <SecondaryButton type="button" onClick={() => setHostOpen((prev) => !prev)}>
              {hostOpen ? 'Hide' : 'Host login'}
            </SecondaryButton>
          </div>
          {hostOpen && (
            <>
              <p className="mt-2 text-xs text-muted">Host console access</p>
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
