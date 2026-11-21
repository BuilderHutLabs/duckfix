import { fireEvent, render, screen } from '@testing-library/react';
import { SignatureCrop } from '../../src/ui/SignatureCrop';
import { strings } from '../../src/ui/strings';

describe('signature crop frame', () => {
  it('shows the frame over the photo in the right place', () => {
    render(<SignatureCrop src="data:," width={1000} height={500} frame={{ x: 100, y: 50, w: 500, h: 250 }} onChange={() => {}} />);
    const frame = screen.getByRole('group', { name: strings.signatureCropHint });
    expect(frame.style.left).toBe('10%');
    expect(frame.style.top).toBe('10%');
    expect(frame.style.width).toBe('50%');
    expect(frame.style.height).toBe('50%');
  });

  it('dragging a corner moves that corner, in photo pixels', () => {
    const onChange = vi.fn();
    const { container } = render(
      <SignatureCrop src="data:," width={1000} height={500} frame={{ x: 100, y: 50, w: 500, h: 250 }} onChange={onChange} />,
    );
    // the photo is shown 500 px wide → 1 screen px = 2 photo px
    const stage = container.querySelector('.sig-crop') as HTMLElement;
    stage.getBoundingClientRect = () => ({ left: 0, top: 0, width: 500, height: 250, right: 500, bottom: 250, x: 0, y: 0, toJSON() {} });
    const se = container.querySelector('[data-handle="se"]') as HTMLElement;
    fireEvent.pointerDown(se, { clientX: 300, clientY: 150, pointerId: 1 });
    fireEvent.pointerMove(se, { clientX: 320, clientY: 160, pointerId: 1 });
    expect(onChange).toHaveBeenLastCalledWith({ x: 100, y: 50, w: 540, h: 270 });
  });
});
