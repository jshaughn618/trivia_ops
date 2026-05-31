import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ExternalLink, Search } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, formatApiError } from '../api';
import { AppShell } from '../components/AppShell';
import { PrimaryButton } from '../components/Buttons';
import { logError } from '../lib/log';
import type { ItemSearchResult } from '../types';

type AnswerPart = {
  label?: unknown;
  answer?: unknown;
  points?: unknown;
};

function parseAnswerParts(value: string | null) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((part: AnswerPart) => ({
        label: typeof part.label === 'string' ? part.label.trim() : '',
        answer: typeof part.answer === 'string' ? part.answer.trim() : '',
        points: typeof part.points === 'number' ? part.points : null
      }))
      .filter((part) => part.answer.length > 0 || part.label.length > 0);
  } catch {
    return [];
  }
}

function formatEditionLabel(result: ItemSearchResult) {
  const editionNumber = result.edition_number ? `Edition ${result.edition_number}` : 'Edition';
  const theme = result.edition_theme?.trim();
  return theme ? `${editionNumber}: ${theme}` : `${editionNumber}: ${result.edition_title}`;
}

function formatLastUsed(value: string | null) {
  if (!value) return 'Never scheduled';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Used before';
  return `Last used ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

function getUsageText(result: ItemSearchResult) {
  if (result.event_usage_count <= 0) return 'No event usage';
  const eventLabel = result.event_usage_count === 1 ? 'event' : 'events';
  const roundLabel = result.round_usage_count === 1 ? 'round' : 'rounds';
  return `${result.event_usage_count} ${eventLabel}, ${result.round_usage_count} ${roundLabel}`;
}

function ResultRow({ result }: { result: ItemSearchResult }) {
  const answerParts = parseAnswerParts(result.answer_parts_json);
  const fallbackAnswers = [result.answer, result.answer_a, result.answer_b]
    .map((answer) => answer?.trim() ?? '')
    .filter(Boolean);
  const answers = answerParts.length > 0 ? answerParts : fallbackAnswers.map((answer) => ({ label: '', answer, points: null }));
  const mediaLabel = result.media_type
    ? `${result.media_type === 'audio' ? 'Audio' : 'Image'}${result.media_caption ? `: ${result.media_caption}` : ''}`
    : null;

  return (
    <article className="border-b border-border py-5 last:border-b-0">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
            <span>{result.game_name}</span>
            <span aria-hidden="true">/</span>
            <span>{formatEditionLabel(result)}</span>
            <span aria-hidden="true">/</span>
            <span>Question {result.item_ordinal}</span>
          </div>
          <Link
            to={`/editions/${result.edition_id}`}
            className="group inline-flex items-start gap-2 text-base font-semibold leading-snug text-text"
          >
            <span>{result.prompt}</span>
            <ExternalLink className="mt-1 h-4 w-4 shrink-0 text-muted transition-colors group-hover:text-accent-ink" />
          </Link>
          {answers.length > 0 && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {answers.map((part, index) => (
                <div key={`${part.label}-${part.answer}-${index}`} className="rounded-lg border border-border bg-panel2 px-3 py-2">
                  {part.label && <div className="text-xs font-medium text-muted">{part.label}</div>}
                  <div className="text-sm text-text">{part.answer}</div>
                </div>
              ))}
            </div>
          )}
          {mediaLabel && <div className="mt-3 text-sm text-muted">{mediaLabel}</div>}
          {result.fun_fact && <div className="mt-3 line-clamp-2 text-sm text-text-soft">{result.fun_fact}</div>}
        </div>
        <div className="w-full shrink-0 rounded-lg border border-border bg-panel2 px-3 py-3 text-sm lg:w-52">
          <div className="font-medium text-text">{getUsageText(result)}</div>
          <div className="mt-1 text-muted">{formatLastUsed(result.last_used_at)}</div>
          <div className="mt-3 text-xs text-muted">{result.edition_status}</div>
        </div>
      </div>
    </article>
  );
}

export function RoundSearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQuery = searchParams.get('q') ?? '';
  const [query, setQuery] = useState(initialQuery);
  const [searchedQuery, setSearchedQuery] = useState(initialQuery);
  const [results, setResults] = useState<ItemSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedQuery = query.trim();
  const resultCountLabel = useMemo(() => {
    if (!hasSearched || loading) return null;
    const label = results.length === 1 ? 'record' : 'records';
    return `${results.length} ${label}`;
  }, [hasSearched, loading, results.length]);

  const runSearch = async (nextQuery = trimmedQuery) => {
    const normalized = nextQuery.trim().replace(/\s+/g, ' ');
    if (!normalized) {
      setResults([]);
      setHasSearched(false);
      setError(null);
      setSearchParams({});
      return;
    }

    setLoading(true);
    setError(null);
    setHasSearched(true);
    setSearchedQuery(normalized);
    setSearchParams({ q: normalized });
    const res = await api.searchItems(normalized);
    setLoading(false);
    if (res.ok) {
      setResults(res.data.results);
      return;
    }

    setResults([]);
    setError(formatApiError(res, 'Search failed.'));
    logError('round_search_failed', { error: res.error });
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    runSearch();
  };

  useEffect(() => {
    if (initialQuery.trim()) {
      runSearch(initialQuery);
    }
  }, []);

  return (
    <AppShell title="Round Search">
      <div className="mx-auto max-w-5xl">
        <form onSubmit={handleSubmit} className="mb-6">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search song, artist, question, or answer"
                className="h-12 w-full rounded-lg border-border-strong bg-panel2 pl-12 pr-4 text-base"
                autoFocus
              />
            </div>
            <PrimaryButton type="submit" disabled={loading || !trimmedQuery} className="h-12 px-5">
              <Search className="h-4 w-4" />
              {loading ? 'Searching' : 'Search'}
            </PrimaryButton>
          </div>
        </form>

        {error && <div className="mb-5 rounded-lg border border-danger bg-panel px-4 py-3 text-sm text-danger-ink">{error}</div>}

        <section className="surface-card overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
            <div>
              <h2 className="panel-title">Matching Records</h2>
              {searchedQuery && <div className="mt-1 text-sm text-muted">Search for "{searchedQuery}"</div>}
            </div>
            {resultCountLabel && <div className="text-sm text-muted">{resultCountLabel}</div>}
          </div>

          <div className="px-5">
            {!hasSearched && (
              <div className="py-12 text-center text-sm text-muted">
                Search existing round items before adding a reused song, artist, question, or answer.
              </div>
            )}
            {hasSearched && loading && <div className="py-12 text-center text-sm text-muted">Searching records...</div>}
            {hasSearched && !loading && results.length === 0 && !error && (
              <div className="py-12 text-center text-sm text-muted">No matching records.</div>
            )}
            {hasSearched && !loading && results.map((result) => <ResultRow key={result.item_id} result={result} />)}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
