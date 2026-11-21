import { act, fireEvent, render, screen } from '@testing-library/react';
import { App } from '../../src/ui/App';
import { createAppStore } from '../../src/ui/store';
import { strings } from '../../src/ui/strings';
import { setPageFilter } from '../../src/model/document';
import { docWithFlags, fakeDeps, source } from './fixtures';

vi.mock('../../src/imaging/render', () => ({
  renderPage: vi.fn(() => new Promise(() => {})),
  releaseCanvas: vi.fn(),
  getPdf: vi.fn(),
  forgetPdf: vi.fn(async () => {}),
}));

function setup() {
  const store = createAppStore(fakeDeps());
  store.load(docWithFlags(3), [source]);
  render(<App store={store} />);
  return store;
}
const looks = (store: ReturnType<typeof setup>) => store.getState().doc.pages.map((p) => p.filter ?? 'color');

describe('look of pages already added', () => {
  it('model: sets the look on the given pages only', () => {
    const doc = setPageFilter(docWithFlags(2), ['p2'], 'bw');
    expect(doc.pages.map((p) => p.filter ?? 'color')).toEqual(['color', 'bw']);
  });

  it('"Wygląd stron" in the ⋯ menu whitens every page; Cofnij undoes it', () => {
    const store = setup();
    fireEvent.click(screen.getByRole('button', { name: strings.more }));
    fireEvent.click(screen.getByRole('button', { name: strings.pageLook }));
    fireEvent.click(screen.getByRole('button', { name: strings.filterWhiten }));
    expect(looks(store)).toEqual(['whiten', 'whiten', 'whiten']);
    fireEvent.click(screen.getByRole('button', { name: strings.undo }));
    expect(looks(store)).toEqual(['color', 'color', 'color']);
  });

  it('in select mode the look applies to the selected pages', () => {
    const store = setup();
    act(() => {
      store.toggleSelecting();
      store.toggleSelected('p2');
    });
    fireEvent.click(screen.getByRole('button', { name: strings.pageLook }));
    fireEvent.click(screen.getByRole('button', { name: strings.filterBw }));
    expect(looks(store)).toEqual(['color', 'bw', 'color']);
  });
});
