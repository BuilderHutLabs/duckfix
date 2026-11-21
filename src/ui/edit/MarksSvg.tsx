import type { Box, Mark } from '../../model/document';
import { CROSS_PATH, INK, LINE_HEIGHT, TICK_PATH, fontFrac } from '../../edit/text';

const COVER_FILL = { black: '#000', white: '#fff' } as const;
type BoxMark = Extract<Mark, Box>;

/**
 * The marks of a page over its box (pageW × pageH screen pixels): covers as one SVG in page
 * fractions, text as real text (so it is not stretched), ticks and crosses as small SVGs.
 */
export function Marks({
  marks,
  pageW,
  pageH,
  boxOf = (m) => m,
}: {
  marks: Mark[] | undefined;
  pageW: number;
  pageH: number;
  boxOf?: (m: BoxMark) => Box;
}) {
  const list = marks ?? [];
  const pct = (v: number) => `${v * 100}%`;
  return (
    <>
      <svg className="marks-svg" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
        {list.map((m) => {
          if (m.kind !== 'cover') return null;
          const b = boxOf(m);
          return <rect key={m.id} data-kind="cover" x={b.x} y={b.y} width={b.w} height={b.h} fill={COVER_FILL[m.color]} />;
        })}
      </svg>
      {list.map((m) => {
        if (m.kind === 'text') {
          const b = boxOf(m);
          return (
            <div
              key={m.id}
              className="mark-text"
              style={{
                left: pct(b.x),
                top: pct(b.y),
                color: INK[m.color],
                fontSize: fontFrac({ text: m.text, h: b.h }) * pageH,
                lineHeight: LINE_HEIGHT,
              }}
            >
              {m.text}
            </div>
          );
        }
        if (m.kind === 'check' || m.kind === 'cross') {
          const b = boxOf(m);
          const stroke = Math.max(1, Math.min(b.w * pageW, b.h * pageH) * 0.12);
          return (
            <svg
              key={m.id}
              data-kind={m.kind}
              className="mark-tick"
              style={{ left: pct(b.x), top: pct(b.y), width: pct(b.w), height: pct(b.h) }}
              viewBox="0 0 1 1"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              {(m.kind === 'check' ? TICK_PATH : CROSS_PATH).map((line, i) => (
                <polyline
                  key={i}
                  points={line.map(([x, y]) => `${x},${y}`).join(' ')}
                  fill="none"
                  stroke={INK[m.color]}
                  strokeWidth={stroke}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </svg>
          );
        }
        return null;
      })}
    </>
  );
}

/** clip-path that shows only the crop of a page whose box sits at `r` in a container of cw×ch. */
export function cropClip(crop: Box, r: { left: number; top: number; width: number; height: number }, cw: number, ch: number): string {
  const px = (v: number) => `${Math.round(Math.max(0, v) * 10) / 10}px`;
  const top = r.top + crop.y * r.height;
  const left = r.left + crop.x * r.width;
  const right = cw - (r.left + (crop.x + crop.w) * r.width);
  const bottom = ch - (r.top + (crop.y + crop.h) * r.height);
  return `inset(${px(top)} ${px(right)} ${px(bottom)} ${px(left)})`;
}
