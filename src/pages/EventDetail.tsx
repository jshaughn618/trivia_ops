import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { AppShell } from '../components/AppShell';
import { Panel } from '../components/Panel';
import { PrimaryButton, SecondaryButton, DangerButton, ButtonLink } from '../components/Buttons';
import { StampBadge } from '../components/StampBadge';
import type { Event, EventRound, GameEdition, Team, Location } from '../types';

export function EventDetailPage() {
  const { eventId } = useParams();
  const [event, setEvent] = useState<Event | null>(null);
  const [rounds, setRounds] = useState<EventRound[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [editions, setEditions] = useState<GameEdition[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [status, setStatus] = useState('planned');
  const [notes, setNotes] = useState('');
  const [locationId, setLocationId] = useState('');
  const [roundLabel, setRoundLabel] = useState('');
  const [roundEditionId, setRoundEditionId] = useState('');
  const [teamName, setTeamName] = useState('');
  const [teamTable, setTeamTable] = useState('');
  const [scoreRoundId, setScoreRoundId] = useState('');
  const [scoreMap, setScoreMap] = useState<Record<string, number>>({});
  const [scoreLoading, setScoreLoading] = useState(false);

  const load = async () => {
    if (!eventId) return;
    const [eventRes, roundsRes, teamsRes, editionsRes, locationsRes] = await Promise.all([
      api.getEvent(eventId),
      api.listEventRounds(eventId),
      api.listTeams(eventId),
      api.listEditions(),
      api.listLocations()
    ]);
    if (eventRes.ok) {
      setEvent(eventRes.data);
      setStatus(eventRes.data.status);
      setNotes(eventRes.data.notes ?? '');
      setLocationId(eventRes.data.location_id ?? '');
    }
    if (roundsRes.ok) setRounds(roundsRes.data.sort((a, b) => a.round_number - b.round_number));
    if (teamsRes.ok) setTeams(teamsRes.data);
    if (editionsRes.ok) setEditions(editionsRes.data);
    if (locationsRes.ok) setLocations(locationsRes.data);
  };

  useEffect(() => {
    load();
  }, [eventId]);

  useEffect(() => {
    if (!scoreRoundId && rounds.length > 0) {
      setScoreRoundId(rounds[0].id);
      loadScores(rounds[0].id);
    }
  }, [rounds, scoreRoundId]);

  const roundNumber = useMemo(() => {
    return rounds.length === 0 ? 1 : Math.max(...rounds.map((round) => round.round_number)) + 1;
  }, [rounds]);

  const updateEvent = async () => {
    if (!eventId) return;
    const res = await api.updateEvent(eventId, { status, notes, location_id: locationId || null });
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

  const loadScores = async (roundId: string) => {
    if (!roundId) return;
    const res = await api.listRoundScores(roundId);
    if (res.ok) {
      const map: Record<string, number> = {};
      res.data.forEach((row) => {
        map[row.team_id] = row.score;
      });
      setScoreMap(map);
    }
  };

  const saveScores = async () => {
    if (!scoreRoundId) return;
    setScoreLoading(true);
    const scores = teams.map((team) => ({
      team_id: team.id,
      score: Number(scoreMap[team.id] ?? 0)
    }));
    await api.updateRoundScores(scoreRoundId, scores);
    setScoreLoading(false);
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
            {event.public_code && (
              <div className="border-2 border-border bg-panel2 p-3">
                <div className="text-xs font-display uppercase tracking-[0.3em] text-muted">Event Code</div>
                <div className="mt-2 text-lg font-display uppercase tracking-[0.3em]">{event.public_code}</div>
                <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-muted">Share for player view</div>
              </div>
            )}
            <div className="flex items-center justify-between border-2 border-border bg-panel2 p-3 text-xs uppercase tracking-[0.2em] text-muted">
              <span>Starts</span>
              <span>{new Date(event.starts_at).toLocaleString()}</span>
            </div>
            <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
              Location
              <select
                className="h-10 px-3"
                value={locationId}
                onChange={(event) => setLocationId(event.target.value)}
              >
                <option value="">No location</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </label>
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
                      {edition.theme ?? 'Untitled Theme'}
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

        <Panel title="Round Scores">
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
              Select Round
              <select
                className="h-10 px-3"
                value={scoreRoundId}
                onChange={(event) => {
                  const value = event.target.value;
                  setScoreRoundId(value);
                  loadScores(value);
                }}
              >
                <option value="">Choose round</option>
                {rounds.map((round) => (
                  <option key={round.id} value={round.id}>
                    {round.round_number}. {round.label}
                  </option>
                ))}
              </select>
            </label>
            {teams.length === 0 && (
              <div className="text-xs uppercase tracking-[0.2em] text-muted">Add teams to score.</div>
            )}
            {teams.map((team) => (
              <label
                key={team.id}
                className="flex items-center justify-between gap-3 border-2 border-border bg-panel2 px-3 py-2 text-xs uppercase tracking-[0.2em] text-muted"
              >
                <span>{team.name}</span>
                <input
                  type="number"
                  className="h-9 w-20 px-2 text-right"
                  value={scoreMap[team.id] ?? 0}
                  onChange={(event) =>
                    setScoreMap((prev) => ({ ...prev, [team.id]: Number(event.target.value) }))
                  }
                />
              </label>
            ))}
            <PrimaryButton onClick={saveScores} disabled={!scoreRoundId || scoreLoading}>
              {scoreLoading ? 'Saving' : 'Save Scores'}
            </PrimaryButton>
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}
