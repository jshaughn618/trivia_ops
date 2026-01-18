import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { AppShell } from '../components/AppShell';
import { Panel } from '../components/Panel';
import { PrimaryButton, SecondaryButton, DangerButton, ButtonLink } from '../components/Buttons';
import { StampBadge } from '../components/StampBadge';
import type { Event, EventRound, GameEdition, Team } from '../types';

export function EventDetailPage() {
  const { eventId } = useParams();
  const [event, setEvent] = useState<Event | null>(null);
  const [rounds, setRounds] = useState<EventRound[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [editions, setEditions] = useState<GameEdition[]>([]);
  const [status, setStatus] = useState('planned');
  const [notes, setNotes] = useState('');
  const [roundLabel, setRoundLabel] = useState('');
  const [roundEditionId, setRoundEditionId] = useState('');
  const [teamName, setTeamName] = useState('');
  const [teamTable, setTeamTable] = useState('');

  const load = async () => {
    if (!eventId) return;
    const [eventRes, roundsRes, teamsRes, editionsRes] = await Promise.all([
      api.getEvent(eventId),
      api.listEventRounds(eventId),
      api.listTeams(eventId),
      api.listEditions()
    ]);
    if (eventRes.ok) {
      setEvent(eventRes.data);
      setStatus(eventRes.data.status);
      setNotes(eventRes.data.notes ?? '');
    }
    if (roundsRes.ok) setRounds(roundsRes.data.sort((a, b) => a.round_number - b.round_number));
    if (teamsRes.ok) setTeams(teamsRes.data);
    if (editionsRes.ok) setEditions(editionsRes.data);
  };

  useEffect(() => {
    load();
  }, [eventId]);

  const roundNumber = useMemo(() => {
    return rounds.length === 0 ? 1 : Math.max(...rounds.map((round) => round.round_number)) + 1;
  }, [rounds]);

  const updateEvent = async () => {
    if (!eventId) return;
    const res = await api.updateEvent(eventId, { status, notes });
    if (res.ok) setEvent(res.data);
  };

  const createRound = async () => {
    if (!eventId || !roundEditionId || !roundLabel.trim()) return;
    await api.createEventRound(eventId, {
      round_number: roundNumber,
      label: roundLabel,
      edition_id: roundEditionId,
      status: 'planned'
    });
    setRoundLabel('');
    setRoundEditionId('');
    load();
  };

  const createTeam = async () => {
    if (!eventId || !teamName.trim()) return;
    await api.createTeam(eventId, { name: teamName, table_label: teamTable || null });
    setTeamName('');
    setTeamTable('');
    load();
  };

  const deleteRound = async (roundId: string) => {
    await api.deleteEventRound(roundId);
    load();
  };

  const deleteTeam = async (teamId: string) => {
    await api.deleteTeam(teamId);
    load();
  };

  if (!event) {
    return (
      <AppShell title="Event Detail">
        <div className="text-xs uppercase tracking-[0.2em] text-muted">Loading...</div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Event Detail">
      <div className="grid gap-4 lg:grid-cols-[1fr,340px]">
        <Panel
          title="Event Status"
          action={<ButtonLink to={`/events/${event.id}/run`} variant="primary">Run Event</ButtonLink>}
        >
          <div className="grid gap-4">
            <div className="border-2 border-border bg-panel2 p-3">
              <div className="text-xs font-display uppercase tracking-[0.3em] text-muted">Title</div>
              <div className="mt-2 text-sm font-display uppercase tracking-[0.2em]">{event.title}</div>
            </div>
            <div className="flex items-center justify-between border-2 border-border bg-panel2 p-3 text-xs uppercase tracking-[0.2em] text-muted">
              <span>Starts</span>
              <span>{new Date(event.starts_at).toLocaleString()}</span>
            </div>
            <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
              Status
              <select className="h-10 px-3" value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="planned">Planned</option>
                <option value="live">Live</option>
                <option value="completed">Completed</option>
                <option value="canceled">Canceled</option>
              </select>
            </label>
            <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
              Notes
              <textarea className="min-h-[80px] px-3 py-2" value={notes} onChange={(event) => setNotes(event.target.value)} />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <PrimaryButton onClick={updateEvent}>Update Event</PrimaryButton>
              <StampBadge label={event.status.toUpperCase()} variant="verified" />
            </div>
          </div>
        </Panel>

        <Panel title="Rounds">
          <div className="flex flex-col gap-3">
            {rounds.length === 0 && (
              <div className="text-xs uppercase tracking-[0.2em] text-muted">No rounds yet.</div>
            )}
            {rounds.map((round) => (
              <div key={round.id} className="border-2 border-border bg-panel2 p-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-display uppercase tracking-[0.2em]">
                    {round.round_number}. {round.label}
                  </div>
                  <StampBadge label={round.status.toUpperCase()} variant="inspected" />
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Link
                    to={`/events/${event.id}/run?round=${round.id}`}
                    className="text-xs uppercase tracking-[0.2em] text-accent"
                  >
                    Open Runner
                  </Link>
                  <DangerButton onClick={() => deleteRound(round.id)}>Delete</DangerButton>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 border-t-2 border-border pt-4">
            <div className="text-xs font-display uppercase tracking-[0.3em] text-muted">Add Round</div>
            <div className="mt-3 flex flex-col gap-3">
              <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
                Label
                <input className="h-10 px-3" value={roundLabel} onChange={(event) => setRoundLabel(event.target.value)} />
              </label>
              <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
                Edition
                <select
                  className="h-10 px-3"
                  value={roundEditionId}
                  onChange={(event) => setRoundEditionId(event.target.value)}
                >
                  <option value="">Select edition</option>
                  {editions.map((edition) => (
                    <option key={edition.id} value={edition.id}>
                      {edition.title}
                    </option>
                  ))}
                </select>
              </label>
              <div className="text-xs uppercase tracking-[0.2em] text-muted">Round Number: {roundNumber}</div>
              <PrimaryButton onClick={createRound}>Add Round</PrimaryButton>
            </div>
          </div>
        </Panel>

        <Panel title="Teams">
          <div className="flex flex-col gap-3">
            {teams.length === 0 && (
              <div className="text-xs uppercase tracking-[0.2em] text-muted">No teams yet.</div>
            )}
            {teams.map((team) => (
              <div key={team.id} className="border-2 border-border bg-panel2 p-3">
                <div className="text-sm font-display uppercase tracking-[0.2em]">{team.name}</div>
                <div className="mt-1 text-xs uppercase tracking-[0.2em] text-muted">
                  {team.table_label ?? 'No table label'}
                </div>
                <div className="mt-2">
                  <DangerButton onClick={() => deleteTeam(team.id)}>Remove</DangerButton>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 border-t-2 border-border pt-4">
            <div className="text-xs font-display uppercase tracking-[0.3em] text-muted">Add Team</div>
            <div className="mt-3 flex flex-col gap-3">
              <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
                Name
                <input className="h-10 px-3" value={teamName} onChange={(event) => setTeamName(event.target.value)} />
              </label>
              <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
                Table Label
                <input className="h-10 px-3" value={teamTable} onChange={(event) => setTeamTable(event.target.value)} />
              </label>
              <SecondaryButton onClick={createTeam}>Add Team</SecondaryButton>
            </div>
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}
