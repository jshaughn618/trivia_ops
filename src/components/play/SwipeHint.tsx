export function SwipeHint({ visible, text }: { visible: boolean; text?: string }) {
  return (
    <div
      className={`pointer-events-none flex items-center justify-center gap-3 text-xs uppercase tracking-[0.3em] text-muted transition-opacity duration-700 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <span aria-hidden="true">‹</span>
      <span>{text ?? 'Swipe for next image'}</span>
      <span aria-hidden="true">›</span>
    </div>
  );
}
