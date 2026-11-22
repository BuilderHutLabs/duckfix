import { fireEvent, render, screen } from '@testing-library/react';
import { ScanPreview, nearestCorner } from '../../src/ui/ScanPreview';
import { strings } from '../../src/ui/strings';

describe('nearestCorner', () => {
  it('picks the corner of the box closest to where the preview was dropped', () => {
    expect(nearestCorner(10, 10, 400, 600)).toBe('tl');
    expect(nearestCorner(390, 20, 400, 600)).toBe('tr');
    expect(nearestCorner(30, 580, 400, 600)).toBe('bl');
    expect(nearestCorner(250, 400, 400, 600)).toBe('br');
  });
});

/** jsdom has no layout: give the box and the preview a size. */
function sized(box: { w: number; h: number }) {
  const parent = document.createElement('div');
  Object.defineProperty(parent, 'clientWidth', { value: box.w });
  Object.defineProperty(parent, 'clientHeight', { value: box.h });
  document.body.appendChild(parent);
  return parent;
}

describe('scan preview', () => {
  beforeEach(() => localStorage.clear());

  it('starts in the top right corner and moves to the corner it is dragged to', () => {
    const parent = sized({ w: 400, h: 600 });
    const { container } = render(<ScanPreview src="blob:p" />, { container: parent });
    const box = container.querySelector('.scan-preview-box') as HTMLElement;
    expect(box.dataset.corner).toBe('tr');
    vi.spyOn(box, 'getBoundingClientRect').mockReturnValue({ left: 300, top: 8, width: 90, height: 120 } as DOMRect);
    vi.spyOn(parent, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 400, height: 600 } as DOMRect);
    fireEvent.pointerDown(box, { pointerId: 1, clientX: 340, clientY: 60 });
    fireEvent.pointerMove(box, { pointerId: 1, clientX: 60, clientY: 560 });
    fireEvent.pointerUp(box, { pointerId: 1, clientX: 60, clientY: 560 });
    expect(box.dataset.corner).toBe('bl');
  });

  it('can be folded away to a small button and brought back; both are remembered', () => {
    const first = render(<ScanPreview src="blob:p" />);
    fireEvent.click(screen.getByRole('button', { name: strings.previewHide }));
    expect(screen.queryByRole('img', { name: strings.cropPreview })).toBeNull();
    first.unmount();
    render(<ScanPreview src="blob:p" />);
    expect(screen.queryByRole('img', { name: strings.cropPreview })).toBeNull(); // still folded next time
    fireEvent.click(screen.getByRole('button', { name: strings.previewShow }));
    expect(screen.getByRole('img', { name: strings.cropPreview })).toBeTruthy();
  });
});
