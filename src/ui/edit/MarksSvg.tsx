import type { Box, Mark } from '../../model/document';
import { CROSS_PATH, INK, LINE_HEIGHT, TICK_PATH, fontFrac } from '../../edit/text';
import { HEAD_FRAC, HIGHLIGHT, HIGHLIGHT_ALPHA, HIGHLIGHT_FRAC, PEN_FRAC, arrowHead, penFrac } from '../../edit/draw';

const COVER_FILL = { black: '#000', white: '#fff' } as const;
type BoxMark = Extract<Mark, Box>;

/**
 * The marks of a page over its box (pageW × pageH screen pixels): covers as one SVG in page
 * fractions, text as real text (so it is not stretched), ticks and crosses as small SVGs.
 */
export function Marks({ marks, pageW, pageH }: { marks: Mark[] | undefined; pageW: number; pageH: number }) {
  const boxOf = (m: BoxMark): Box => m;
  const pen = Math.max(1, PEN_FRAC * pageW);
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
        {list.map((m) => {
          const line = { fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round', vectorEffect: 'non-scaling-stroke' } as const;
          if (m.kind === 'pen' || m.kind === 'highlight') {
            const pts = m.points.length === 2 ? [...m.points, m.points[0] + 0.0001, m.points[1]] : m.points;
            const points = pts.reduce((s, v, i) => s + (i % 2 ? `,${v}` : ` ${v}`), '').trim();
            return m.kind === 'pen' ? (
              <polyline key={m.id} data-kind="pen" points={points} stroke={INK[m.color]} strokeWidth={Math.max(1, penFrac(m.width) * pageW)} {...line} />
            ) : (
              <polyline
                key={m.id}
                data-kind="highlight"
                points={points}
                stroke={HIGHLIGHT[m.color]}
                strokeOpacity={HIGHLIGHT_ALPHA}
                strokeWidth={Math.max(2, HIGHLIGHT_FRAC * pageW)}
                {...line}
              />
            );
          }
          if (m.kind === 'rect') {
            return <rect key={m.id} data-kind="rect" x={m.x} y={m.y} width={m.w} height={m.h} stroke={INK[m.color]} strokeWidth={pen} {...line} />;
          }
          if (m.kind === 'ellipse') {
            return (
              <ellipse
                key={m.id}
                data-kind="ellipse"
                cx={m.x + m.w / 2}
                cy={m.y + m.h / 2}
                rx={Math.abs(m.w) / 2}
                ry={Math.abs(m.h) / 2}
                stroke={INK[m.color]}
                strokeWidth={pen}
                {...line}
              />
            );
          }
          if (m.kind === 'arrow') {
            // the head is shaped in screen pixels, so it is not stretched by the page's proportions
            const head = arrowHead(m.x * pageW, m.y * pageH, (m.x + m.w) * pageW, (m.y + m.h) * pageH, HEAD_FRAC * pageW)
              .map(([x, y]) => `${x / pageW},${y / pageH}`)
              .join(' ');
            return (
              <g key={m.id} data-kind="arrow">
                <line x1={m.x} y1={m.y} x2={m.x + m.w} y2={m.y + m.h} stroke={INK[m.color]} strokeWidth={pen} {...line} />
                <polygon points={head} fill={INK[m.color]} />
              </g>
            );
          }
          return null;
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
