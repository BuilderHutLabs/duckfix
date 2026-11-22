/** Line icons of the editor (24 px grid, drawn with the text colour), one consistent set instead of emoji. */
const PATHS = {
  text: 'M5 6V4h14v2M12 4v16M9 20h6',
  marks: 'M3 13l4 4 7-8M14 15l6 6M20 15l-6 6',
  tick: 'M4 12l5 5L20 6',
  cross: 'M6 6l12 12M18 6L6 18',
  date: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4M8 14h3v3H8z',
  draw: 'M4 20l4-1 11-11-3-3L5 16zM14 6l3 3',
  pen: 'M4 20l4-1 11-11-3-3L5 16zM14 6l3 3',
  eraser: 'M8 20h12M5 15l9-9 5 5-8 8H8z M10 10l5 5',
  highlight: 'M9 15l-3 3h5l1-1M14 4l6 6-8 8-6-6zM4 21h16',
  shapes: 'M3 5h10v10H3zM21 15a5 5 0 1 1-10 0 5 5 0 0 1 10 0z',
  arrow: 'M5 19L19 5M10 5h9v9',
  rect: 'M4 6h16v12H4z',
  ellipse: 'M21 12c0 4-4 7-9 7s-9-3-9-7 4-7 9-7 9 3 9 7z',
  hide: 'M3 9h18v6H3zM6 12h12',
  cover: 'M3 9h18v6H3zM6 12h12',
  crop: 'M6 2v16h16M2 6h16v16',
  sign: 'M3 17c3-6 5-9 6-7s-2 7 0 7 3-5 5-5 1 4 3 4 3-2 4-2M3 21h18',
  copy: 'M8 8h12v12H8zM16 8V4H4v12h4',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  pages: 'M8 4h11v14H8zM5 7v13h11',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM8.5 12l2.5 2.5 4.5-5',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  const fill = name === 'cover' || name === 'hide';
  return (
    <svg
      className="edit-icon"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={name === 'more' ? 3 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {fill ? <rect x="3" y="8" width="18" height="8" rx="1.5" fill="currentColor" stroke="none" /> : <path d={PATHS[name]} />}
    </svg>
  );
}
