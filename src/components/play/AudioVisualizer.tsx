import { useEffect, useMemo, useState } from 'react';

const MIN_LEVEL = 0.18;
const MAX_LEVEL = 0.98;
const DEFAULT_BARS = 18;

type AudioVisualizerProps = {
  active: boolean;
  bars?: number;
  className?: string;
};

const createBaseLevels = (count: number) => Array.from({ length: count }, () => MIN_LEVEL);

export function AudioVisualizer({ active, bars = DEFAULT_BARS, className }: AudioVisualizerProps) {
  const barCount = Math.max(8, bars);
  const [levels, setLevels] = useState<number[]>(() => createBaseLevels(barCount));

  const mid = useMemo(() => (barCount - 1) / 2, [barCount]);

  useEffect(() => {
    setLevels(createBaseLevels(barCount));
  }, [barCount]);

  useEffect(() => {
    if (!active) {
      setLevels(createBaseLevels(barCount));
      return;
    }

    const animate = () => {
      setLevels((prev) =>
        prev.map((level, index) => {
          const centerWeight = 1 - Math.min(1, Math.abs(index - mid) / Math.max(1, mid));
          const random = Math.random();
          const target =
            MIN_LEVEL + (MAX_LEVEL - MIN_LEVEL) * (0.25 + centerWeight * 0.65 * random + 0.1 * Math.random());
          return level * 0.36 + target * 0.64;
        })
      );
    };

    animate();
    const interval = window.setInterval(animate, 120);
    return () => window.clearInterval(interval);
  }, [active, barCount, mid]);

  return (
    <div
      className={`audio-visualizer ${active ? 'audio-visualizer--active' : ''} ${className ?? ''}`.trim()}
      aria-hidden="true"
      style={{ gridTemplateColumns: `repeat(${barCount}, minmax(0, 1fr))` }}
    >
      {levels.map((level, index) => (
        <span
          key={`viz-${index}`}
          className="audio-visualizer__bar"
          style={{
            transform: `scaleY(${level})`,
            opacity: active ? 0.45 + level * 0.55 : 0.38
          }}
        />
      ))}
    </div>
  );
}
