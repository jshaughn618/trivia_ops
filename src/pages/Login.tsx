import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PrimaryButton, SecondaryButton } from '../components/Buttons';
import { PromptHero } from '../components/play/PromptHero';
import { api, formatApiError } from '../api';
import { useAuth } from '../auth';
import { useTheme } from '../lib/theme';
import logoDark from '../assets/trivia_ops_logo_dark.png';
import logoLight from '../assets/trivia_ops_logo_light.png';

export function LoginPage() {
  const { theme } = useTheme();
  const logo = theme === 'light' ? logoLight : logoDark;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [eventCode, setEventCode] = useState(['', '', '', '']);
  const [teamCode, setTeamCode] = useState(['', '', '', '']);
  const [teamNameInput, setTeamNameInput] = useState('');
  const [eventInfo, setEventInfo] = useState<{ id: string; title: string; public_code: string } | null>(null);
  const [step, setStep] = useState<'event' | 'team'>('event');
  const [requireTeamName, setRequireTeamName] = useState(false);
  const [requireTeamNameCode, setRequireTeamNameCode] = useState('');
  const [eventError, setEventError] = useState<string | null>(null);
  const [teamError, setTeamError] = useState<string | null>(null);
  const [eventLoading, setEventLoading] = useState(false);
  const [teamLoading, setTeamLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hostOpen, setHostOpen] = useState(false);
  const eventRefs = useRef<Array<HTMLInputElement | null>>([]);
  const teamRefs = useRef<Array<HTMLInputElement | null>>([]);
  const autoJoinRef = useRef(false);
  const navigate = useNavigate();
  const location = useLocation();
  const auth = useAuth();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const result = await auth.login(email, password);
    setLoading(false);
    if (result.ok) {
      navigate(result.user?.user_type === 'admin' ? '/dashboard' : '/events');
    } else {
      const requestId = (result as { requestId?: string }).requestId;
      setError(requestId ? `${result.message ?? 'Login failed'} (ref ${requestId})` : result.message ?? 'Login failed');
    }
  };

  const sanitized = (value: string) => value.replace(/\D/g, '');
  const eventValue = eventCode.join('');
  const eventReady = eventCode.every((digit) => digit.length === 1);
  const teamValue = teamCode.join('');
  const teamReady = teamCode.every((digit) => digit.length === 1);

  const attemptEvent = async (value: string, autoTeamCode?: string) => {
    const normalized = sanitized(value);
    if (normalized.length !== 4 || eventLoading) return;
    setEventError(null);
    setEventLoading(true);
    try {
      const res = await api.publicEvent(normalized);
      if (res.ok) {
        setEventInfo(res.data.event);
        setStep('team');
        setTeamCode(['', '', '', '']);
        setTeamNameInput('');
        setRequireTeamName(false);
        setRequireTeamNameCode('');
        if (autoTeamCode && autoTeamCode.length === 4) {
          const digits = autoTeamCode.split('');
          setTeamCode(digits);
        }
        return;
      }
      setEventError('Event code not found. Check the code and try again.');
      setEventCode(['', '', '', '']);
      eventRefs.current[0]?.focus();
    } catch {
      setEventError('Could not validate the event code. Please try again.');
    } finally {
      setEventLoading(false);
    }
  };

  const attemptTeamJoin = async (value: string, eventOverride?: { id: string; title: string; public_code: string }) => {
    const normalized = sanitized(value);
    const eventData = eventOverride ?? eventInfo;
    if (normalized.length !== 4 || teamLoading || !eventData) return;
    setTeamError(null);
    setTeamLoading(true);
    try {
      const namePayload = teamNameInput.trim();
      const res = await api.publicJoin(eventData.public_code, {
        team_code: normalized,
        ...(namePayload ? { team_name: namePayload } : {})
      });
      if (res.ok) {
        localStorage.setItem(`player_team_${eventData.id}`, res.data.team.id);
        localStorage.setItem(`player_team_id_${eventData.public_code}`, res.data.team.id);
        localStorage.setItem(`player_team_code_${eventData.public_code}`, res.data.team.id);
        localStorage.setItem(`player_team_name_${eventData.public_code}`, res.data.team.name);
        localStorage.setItem(`player_team_session_${eventData.public_code}`, res.data.session_token);
        navigate(`/play/${eventData.public_code}`);
        return;
      }
      if (res.error?.code === 'team_name_required') {
        setRequireTeamName(true);
        setRequireTeamNameCode(normalized);
        setTeamError(formatApiError(res, 'Team name required to claim this code.'));
        return;
      }
      setTeamError(formatApiError(res, 'Team code not recognized. Check the code and try again.'));
      setTeamCode(['', '', '', '']);
      teamRefs.current[0]?.focus();
    } catch {
      setTeamError('Could not validate the team code. Please try again.');
    } finally {
      setTeamLoading(false);
    }
  };

  useEffect(() => {
    if (step === 'event') {
      eventRefs.current[0]?.focus();
    } else {
      teamRefs.current[0]?.focus();
    }
  }, [step]);

  useEffect(() => {
    if (autoJoinRef.current) return;
    autoJoinRef.current = true;
    const params = new URLSearchParams(location.search);
    const eventParam = sanitized(params.get('event') ?? params.get('code') ?? '');
    const teamParam = sanitized(params.get('team') ?? params.get('team_code') ?? '');
    if (eventParam.length === 4) {
      setEventCode(eventParam.split(''));
      attemptEvent(eventParam, teamParam.length === 4 ? teamParam : undefined);
    }
  }, [location.search]);

  return (
    <div className="min-h-screen bg-bg text-text flex items-center justify-center px-4">
      <div className="w-full max-w-md border-2 border-border bg-panel p-6">
        <img src={logo} alt="Trivia Ops" className="h-16 w-auto" />
        <div className="mt-2 text-sm leading-tight text-muted">The command center for live trivia fun.</div>
        <div className="mt-4">
          <div className="text-3xl font-display tracking-tight">Join game</div>
          {step === 'event' ? (
            <>
              <div className="mt-2 text-sm text-muted">Enter the 4-digit event code from your host</div>
              <div className="mt-1 text-xs text-muted">&nbsp;</div>
              <div className="mt-3 flex flex-col gap-3">
                <div className="flex justify-center gap-3">
                  {eventCode.map((value, index) => (
                    <input
                      key={`event-code-${index}`}
                      ref={(el) => {
                        eventRefs.current[index] = el;
                      }}
                      type="tel"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={1}
                      className="h-16 w-16 border-2 border-strong bg-panel2 text-center text-2xl font-display tracking-[0.2em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
                      value={value}
                      onChange={(event) => {
                        const next = sanitized(event.target.value).slice(0, 1);
                        setEventCode((prev) => {
                          const updated = [...prev];
                          updated[index] = next;
                          if (updated.every((digit) => digit)) {
                            attemptEvent(updated.join(''));
                          }
                          return updated;
                        });
                        if (next && index < eventRefs.current.length - 1) {
                          eventRefs.current[index + 1]?.focus();
                        }
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Backspace' && !eventCode[index] && index > 0) {
                          eventRefs.current[index - 1]?.focus();
                        }
                        if (event.key === 'Enter' && eventReady) {
                          attemptEvent(eventValue);
                        }
                      }}
                      onPaste={(event) => {
                        event.preventDefault();
                        const paste = sanitized(event.clipboardData.getData('text'));
                        if (!paste) return;
                        setEventCode((prev) => {
                          const updated = [...prev];
                          for (let i = 0; i < paste.length && index + i < updated.length; i += 1) {
                            updated[index + i] = paste[i];
                          }
                          if (updated.every((digit) => digit)) {
                            attemptEvent(updated.join(''));
                          }
                          return updated;
                        });
                        const nextIndex = Math.min(index + paste.length, eventRefs.current.length - 1);
                        eventRefs.current[nextIndex]?.focus();
                      }}
                      aria-label={`Event code digit ${index + 1}`}
                    />
                  ))}
                </div>
                {eventError && (
                  <div className="border border-danger bg-panel2 px-3 py-2 text-xs text-danger-ink" aria-live="polite">
                    {eventError}
                  </div>
                )}
                <PrimaryButton
                  type="button"
                  onClick={() => {
                    if (eventReady) attemptEvent(eventValue);
                  }}
                  disabled={!eventReady || eventLoading}
                >
                  {eventLoading ? 'Checking…' : 'Continue'}
                </PrimaryButton>
              </div>
            </>
          ) : (
            <>
              <div className="mt-4 flex w-full flex-col items-center gap-6 text-center">
                <div className="text-xs uppercase tracking-[0.35em] text-muted">Join your team</div>
                <PromptHero>Enter the team code from your scoresheet.</PromptHero>
                <div className="w-full rounded-2xl bg-panel/40 p-4 text-left">
                  <div className="text-xs uppercase tracking-[0.3em] text-muted">Team code</div>
                  <div className="mt-4 flex flex-col gap-3">
                    <div className="flex flex-col gap-2">
                      <div className="flex justify-center gap-3">
                        {teamCode.map((value, index) => (
                          <input
                            key={`team-code-${index}`}
                            ref={(el) => {
                              teamRefs.current[index] = el;
                            }}
                            type="tel"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            maxLength={1}
                            className="h-14 w-14 border-2 border-strong bg-panel2 text-center text-2xl font-display tracking-[0.2em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
                            value={value}
                            onChange={(event) => {
                              const next = sanitized(event.target.value).slice(0, 1);
                              setTeamCode((prev) => {
                                const updated = [...prev];
                                updated[index] = next;
                                const nextCode = updated.join('');
                                if (requireTeamName && requireTeamNameCode && nextCode !== requireTeamNameCode) {
                                  setRequireTeamName(false);
                                  setRequireTeamNameCode('');
                                }
                                if (updated.every((digit) => digit) && (!requireTeamName || teamNameInput.trim())) {
                                  attemptTeamJoin(updated.join(''));
                                }
                                return updated;
                              });
                              if (next && index < teamRefs.current.length - 1) {
                                teamRefs.current[index + 1]?.focus();
                              }
                            }}
                            onKeyDown={(event) => {
                              if (event.key === 'Backspace' && !teamCode[index] && index > 0) {
                                teamRefs.current[index - 1]?.focus();
                              }
                              if (event.key === 'Enter' && teamReady) {
                                attemptTeamJoin(teamValue);
                              }
                            }}
                            onPaste={(event) => {
                              event.preventDefault();
                              const paste = sanitized(event.clipboardData.getData('text'));
                              if (!paste) return;
                              setTeamCode((prev) => {
                                const updated = [...prev];
                                for (let i = 0; i < paste.length && index + i < updated.length; i += 1) {
                                  updated[index + i] = paste[i];
                                }
                                const nextCode = updated.join('');
                                if (requireTeamName && requireTeamNameCode && nextCode !== requireTeamNameCode) {
                                  setRequireTeamName(false);
                                  setRequireTeamNameCode('');
                                }
                                if (updated.every((digit) => digit) && (!requireTeamName || teamNameInput.trim())) {
                                  attemptTeamJoin(updated.join(''));
                                }
                                return updated;
                              });
                              const nextIndex = Math.min(index + paste.length, teamRefs.current.length - 1);
                              teamRefs.current[nextIndex]?.focus();
                            }}
                            aria-label={`Team code digit ${index + 1}`}
                          />
                        ))}
                      </div>
                    </div>
                    {requireTeamName && (
                      <label className="flex flex-col gap-2">
                        <span className="text-xs uppercase tracking-[0.25em] text-muted">Team name required</span>
                        <input
                          className="h-10 px-3"
                          value={teamNameInput}
                          onChange={(event) => setTeamNameInput(event.target.value)}
                          placeholder="Enter your team name"
                        />
                      </label>
                    )}
                    {teamError && (
                      <div className="border border-danger bg-panel2 px-3 py-2 text-xs text-danger-ink" aria-live="polite">
                        {teamError}
                      </div>
                    )}
                    <PrimaryButton
                      type="button"
                      onClick={() => {
                        if (teamReady) attemptTeamJoin(teamValue);
                      }}
                      disabled={!teamReady || teamLoading || (requireTeamName && !teamNameInput.trim())}
                    >
                      {teamLoading ? 'Joining…' : 'Join'}
                    </PrimaryButton>
                    <SecondaryButton
                      type="button"
                      onClick={() => {
                        setStep('event');
                        setEventInfo(null);
                        setEventCode(['', '', '', '']);
                        setTeamCode(['', '', '', '']);
                        setTeamNameInput('');
                        setRequireTeamName(false);
                        setRequireTeamNameCode('');
                        setEventError(null);
                        setTeamError(null);
                      }}
                    >
                      Change event code
                    </SecondaryButton>
                  </div>
                </div>
              </div>
            </>
          )}
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
                  <div className="border-2 border-danger bg-panel2 px-3 py-2 text-xs uppercase tracking-[0.2em] text-danger" aria-live="polite">
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
