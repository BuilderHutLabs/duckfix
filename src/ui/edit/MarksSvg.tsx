import type { Box, Mark } from '../../model/document';

const COVER_FILL = { black: '#000', white: '#fff' } as const;

/** The marks of a page as SVG in page fractions (viewBox 0..1), stretched over the page box. */
export function MarksSvg({ marks, boxOf = (m) => m }: { marks: Mark[] | undefined; boxOf?: (m: Extract<Mark, Box>) => Box }) {
  return (
    <svg className="marks-svg" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
      {(marks ?? []).map((m) => {
        if (m.kind !== 'cover') return null;
        const b = boxOf(m);
        return <rect key={m.id} data-kind="cover" x={b.x} y={b.y} width={b.w} height={b.h} fill={COVER_FILL[m.color]} />;
      })}
    </svg>
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
