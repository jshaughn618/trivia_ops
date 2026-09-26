import { useEffect, useState } from 'react';
import { Download, FileText } from 'lucide-react';
import { toOwnedArrayBuffer } from '../../shared/binary';
import { buildGenericRoundSheetsPdf, ROUND_SHEET_PRESETS, type GenericRoundSheet } from '../lib/genericRoundSheets';
import { PrimaryButton } from './Buttons';

function RoundFields({ id, label, sheet, onChange }: {
  id: string;
  label: string;
  sheet: GenericRoundSheet;
  onChange: (sheet: GenericRoundSheet) => void;
}) {
  return (
    <fieldset className="min-w-0 space-y-3">
      <legend className="mb-3 text-sm font-semibold text-text">{label}</legend>
      <label className="flex flex-col gap-1 text-sm" htmlFor={`${id}-title`}>
        Sheet title
        <input id={`${id}-title`} value={sheet.title} maxLength={60} required onChange={event => onChange({ ...sheet, title: event.target.value })} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm" htmlFor={`${id}-count`}>
          Number of questions
          <input id={`${id}-count`} type="number" min={1} max={15} step={1} required value={Number.isNaN(sheet.answerCount) ? '' : sheet.answerCount} onChange={event => onChange({ ...sheet, answerCount: event.target.valueAsNumber })} />
        </label>
        <label className="flex flex-col gap-1 text-sm" htmlFor={`${id}-columns`}>
          Answer columns
          <select id={`${id}-columns`} value={sheet.columns.length} onChange={event => onChange({ ...sheet, columns: event.target.value === '2' ? ['Song', 'Artist'] : ['Answer'] })}>
            <option value="1">One</option>
            <option value="2">Two</option>
          </select>
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {sheet.columns.map((column, index) => (
          <label key={index} className="flex flex-col gap-1 text-sm" htmlFor={`${id}-column-${index}`}>
            {sheet.columns.length === 1 ? 'Column label' : `Column ${index + 1} label`}
            <input id={`${id}-column-${index}`} value={column} maxLength={24} required onChange={event => onChange({ ...sheet, columns: sheet.columns.map((value, i) => i === index ? event.target.value : value) })} />
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function GenericRoundSheets() {
  const [layout, setLayout] = useState('single');
  const [preset, setPreset] = useState('general');
  const [single, setSingle] = useState(ROUND_SHEET_PRESETS.general);
  const [audio, setAudio] = useState(ROUND_SHEET_PRESETS.audio);
  const [word, setWord] = useState(ROUND_SHEET_PRESETS.justOneWord);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ url: string; filename: string } | null>(null);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);
  useEffect(() => { setPreview(null); setError(null); }, [layout, single, audio, word]);

  const generate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setGenerating(true);
    setError(null);
    try {
      const sheets = layout === 'paired' ? [audio, word] : [single];
      const bytes = await buildGenericRoundSheetsPdf(sheets);
      const slug = sheets.map(sheet => sheet.title).join('-').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'generic';
      const url = URL.createObjectURL(new Blob([toOwnedArrayBuffer(bytes)], { type: 'application/pdf' }));
      setPreview({ url, filename: `round-sheets-${slug}.pdf` });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to generate round sheets.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <section className="glass-inset p-4 sm:p-5" aria-labelledby="generic-round-sheets-title">
      <h3 id="generic-round-sheets-title" className="flex items-center gap-2 text-sm font-semibold text-text">
        <FileText className="h-4 w-4 text-accent-ink" /> Generic Round Sheets
      </h3>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Blank player answer sheets, with two identical copies on US Letter paper. Cut along the horizontal center line.
      </p>
      <form onSubmit={generate} className="mt-5 space-y-5">
        <fieldset disabled={generating} className="space-y-5">
          <div className="grid max-w-2xl gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm" htmlFor="round-sheet-layout">
              Layout
              <select id="round-sheet-layout" value={layout} onChange={event => setLayout(event.target.value)}>
                <option value="single">One round per half-sheet</option>
                <option value="paired">Audio + Just One Word per half-sheet</option>
              </select>
            </label>
            {layout === 'single' && (
              <label className="flex flex-col gap-1 text-sm" htmlFor="round-sheet-preset">
                Game format
                <select id="round-sheet-preset" value={preset} onChange={event => { setPreset(event.target.value); setSingle({ ...ROUND_SHEET_PRESETS[event.target.value] }); }}>
                  {Object.entries(ROUND_SHEET_PRESETS).map(([key, value]) => <option key={key} value={key}>{value.title}</option>)}
                </select>
              </label>
            )}
          </div>
          {layout === 'paired' ? (
            <div className="grid max-w-3xl gap-6 sm:grid-cols-2">
              <RoundFields id="round-audio" label="Left: Audio" sheet={audio} onChange={setAudio} />
              <RoundFields id="round-word" label="Right: Just One Word" sheet={word} onChange={setWord} />
            </div>
          ) : (
            <div className="max-w-xl"><RoundFields id="round-single" label="Round Details" sheet={single} onChange={setSingle} /></div>
          )}
          <p className="text-sm text-muted">Use 1–15 questions per round. Print at actual size (100%), one PDF page per sheet.</p>
          <PrimaryButton type="submit" disabled={generating}>
            <FileText className="h-4 w-4" /> {generating ? 'Generating…' : 'Generate PDF'}
          </PrimaryButton>
        </fieldset>
      </form>
      {error && <p role="alert" className="mt-3 text-sm text-danger-ink">{error}</p>}
      {preview && (
        <div className="mt-5 space-y-3">
          <a href={preview.url} download={preview.filename} className="inline-flex items-center gap-2 text-sm font-medium text-accent-ink hover:underline">
            <Download className="h-4 w-4" /> Download round sheets
          </a>
          <p className="text-sm text-muted" role="status">Your PDF is ready. Download it to print as many copies as you need.</p>
          <iframe src={preview.url} title="Generic round sheets PDF preview" className="h-[560px] w-full border border-border bg-white" />
        </div>
      )}
    </section>
  );
}
