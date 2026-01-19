import { useEffect, useMemo, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { api } from '../api';
import { AppShell } from '../components/AppShell';
import { Panel } from '../components/Panel';
import { PrimaryButton, SecondaryButton, DangerButton } from '../components/Buttons';
import { StampBadge } from '../components/StampBadge';
import type { EditionItem, Event, EventRound } from '../types';

function useQuery() {
  return new URLSearchParams(useLocation().search);
}

export function EventRunPage() {
  const { eventId } = useParams();
  const query = useQuery();
  const [event, setEvent] = useState<Event | null>(null);
  const [rounds, setRounds] = useState<EventRound[]>([]);
  const [roundId, setRoundId] = useState('');
  const [items, setItems] = useState<EditionItem[]>([]);
  const [index, setIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [showFact, setShowFact] = useState(false);

  const load = async () => {
    if (!eventId) return;
    const [eventRes, roundsRes] = await Promise.all([api.getEvent(eventId), api.listEventRounds(eventId)]);
    if (eventRes.ok) setEvent(eventRes.data);
    if (roundsRes.ok) setRounds(roundsRes.data);
    const preselect = query.get('round') ?? '';
    if (preselect) setRoundId(preselect);
  };

  const loadItems = async (selectedRoundId: string) => {
    if (!selectedRoundId) return;
    const res = await api.listEventRoundItems(selectedRoundId);
    if (res.ok) {
      const sorted = res.data.sort((a, b) => a.ordinal - b.ordinal);
      setItems(sorted);
      setIndex(0);
      setShowAnswer(false);
      setShowFact(false);
      if (eventId) {
        await api.updateLiveState(eventId, {
          active_round_id: selectedRoundId,
          current_item_ordinal: sorted[0]?.ordinal ?? null,
          reveal_answer: false,
          reveal_fun_fact: false
        });
      }
    }
  };

  useEffect(() => {
    load();
  }, [eventId]);

  useEffect(() => {
    if (roundId) loadItems(roundId);
  }, [roundId]);

  const activeRound = useMemo(() => rounds.find((round) => round.id === roundId) ?? null, [rounds, roundId]);
  const item = items[index];

  const nextItem = () => {
    if (index < items.length - 1) {
      const nextIndex = index + 1;
      setIndex(nextIndex);
      setShowAnswer(false);
      setShowFact(false);
      if (eventId) {
        api.updateLiveState(eventId, {
          current_item_ordinal: items[nextIndex]?.ordinal ?? null,
          reveal_answer: false,
          reveal_fun_fact: false
        });
      }
    }
  };

  const lockRound = async () => {
    if (!activeRound) return;
    await api.updateEventRound(activeRound.id, { status: 'locked' });
    await load();
  };

  const setLive = async () => {
    if (!activeRound) return;
    await api.updateEventRound(activeRound.id, { status: 'live' });
    await load();
  };

  if (!event) {
    return (
      <AppShell title="Round Runner">
        <div className="text-xs uppercase tracking-[0.2em] text-muted">Loading...</div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Round Runner">
      <div className="grid gap-4 lg:grid-cols-[1fr,320px]">
        <Panel title="Active Prompt">
          {activeRound ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div className="text-xs uppercase tracking-[0.2em] text-muted">{activeRound.label}</div>
                <StampBadge label={activeRound.status.toUpperCase()} variant="verified" />
              </div>
              {item ? (
                <div className="border-2 border-border bg-panel2 p-4">
                  <div className="text-xs uppercase tracking-[0.2em] text-muted">Prompt</div>
                  <div className="mt-2 text-lg font-display uppercase tracking-[0.2em]">{item.prompt}</div>
                  {item.media_type === 'image' && item.media_key && (
                    <img
                      className="mt-4 max-h-64 w-full object-cover border-2 border-border"
                      src={api.mediaUrl(item.media_key)}
                      alt={item.media_caption ?? 'Media'}
                    />
                  )}
                  {item.media_type === 'audio' && item.media_key && (
                    <audio className="mt-4 w-full" controls src={api.mediaUrl(item.media_key)} />
                  )}
                </div>
              ) : (
                <div className="text-xs uppercase tracking-[0.2em] text-muted">No items in this round.</div>
              )}
              {item && showAnswer && (
                <div className="border-2 border-border bg-panel p-4">
                  <div className="text-xs uppercase tracking-[0.2em] text-muted">Answer</div>
                  <div className="mt-2 text-base font-display uppercase tracking-[0.2em]">
                    {item.answer || (item.answer_a && item.answer_b
                      ? `${item.answer_a_label ? `${item.answer_a_label}: ` : 'A: '}${item.answer_a} / ${item.answer_b_label ? `${item.answer_b_label}: ` : 'B: '}${item.answer_b}`
                      : '')}
                  </div>
                </div>
              )}
              {item && showFact && item.fun_fact && (
                <div className="border-2 border-border bg-panel p-4">
                  <div className="text-xs uppercase tracking-[0.2em] text-muted">Fun Fact</div>
                  <div className="mt-2 text-sm text-text">{item.fun_fact}</div>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <PrimaryButton
                  onClick={() => {
                    setShowAnswer(true);
                    if (eventId) api.updateLiveState(eventId, { reveal_answer: true });
                  }}
                  disabled={!item}
                >
                  Reveal Answer
                </PrimaryButton>
                <SecondaryButton
                  onClick={() => {
                    setShowFact(true);
                    if (eventId) api.updateLiveState(eventId, { reveal_fun_fact: true });
                  }}
                  disabled={!item}
                >
                  Reveal Fact
                </SecondaryButton>
                <PrimaryButton onClick={nextItem} disabled={!item} className="py-4 text-sm">
                  Next
                </PrimaryButton>
                <DangerButton onClick={lockRound} disabled={!activeRound} className="py-4 text-sm">
                  Lock In
                </DangerButton>
                {activeRound?.status !== 'live' && (
                  <SecondaryButton onClick={setLive} disabled={!activeRound}>
                    Go Live
                  </SecondaryButton>
                )}
              </div>
              <div className="text-xs uppercase tracking-[0.2em] text-muted">
                Item {items.length === 0 ? 0 : index + 1} / {items.length}
              </div>
            </div>
          ) : (
            <div className="text-xs uppercase tracking-[0.2em] text-muted">Select a round to begin.</div>
          )}
        </Panel>
        <Panel title="Round Control">
          <div className="flex flex-col gap-4">
            <div className="text-xs uppercase tracking-[0.2em] text-muted">Event</div>
            <div className="text-sm font-display uppercase tracking-[0.2em]">{event.title}</div>
            <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
              Select Round
              <select className="h-10 px-3" value={roundId} onChange={(event) => setRoundId(event.target.value)}>
                <option value="">Choose round</option>
                {rounds.map((round) => (
                  <option key={round.id} value={round.id}>
                    {round.round_number}. {round.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="border-2 border-border bg-panel2 p-3 text-xs uppercase tracking-[0.2em] text-muted">
              {activeRound ? `Status: ${activeRound.status}` : 'Awaiting round selection'}
            </div>
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}
