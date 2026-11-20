import { fireEvent, render, screen } from '@testing-library/react';
import { App } from '../../src/ui/App';
import { createAppStore } from '../../src/ui/store';
import { strings } from '../../src/ui/strings';
import { rotatePages } from '../../src/model/document';
import { docWithFlags, fakeDeps, source } from './fixtures';

vi.mock('../../src/imaging/render', () => ({
  renderPage: vi.fn(() => new Promise(() => {})),
  releaseCanvas: vi.fn(),
  getPdf: vi.fn(),
  forgetPdf: vi.fn(async () => {}),
}));

describe('blank pages', () => {
  it('"Usuń puste strony (2)" removes only the blank pages, and Cofnij brings them back', () => {
    const store = createAppStore(fakeDeps());
    store.load(docWithFlags(4, { 1: ['blank'], 3: ['blank'] }), [source]);
    render(<App store={store} />);
    expect(screen.getAllByText(strings.flagLabels.blank).length).toBe(2);
    fireEvent.click(screen.getByRole('button', { name: strings.removeBlank(2) }));
    expect(store.getState().doc.pages.map((p) => p.id)).toEqual(['p1', 'p3']);
    expect(screen.queryByRole('button', { name: strings.removeBlank(2) })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: strings.undo }));
    expect(store.getState().doc.pages.map((p) => p.id)).toEqual(['p1', 'p2', 'p3', 'p4']);
  });

  it('no blank pages, no button', () => {
    const store = createAppStore(fakeDeps());
    store.load(docWithFlags(2, { 0: ['low-text'] }), [source]);
    render(<App store={store} />);
    expect(screen.queryByRole('button', { name: /^(Usuń puste|Remove blank)/ })).toBeNull();
  });

  it('turning a page by hand means it was checked: the blank flag goes', () => {
    const doc = rotatePages(docWithFlags(1, { 0: ['blank'] }), ['p1'], 90);
    expect(doc.pages[0].flags).toEqual([]);
  });
});
