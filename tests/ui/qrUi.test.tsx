import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { App } from '../../src/ui/App';
import { createAppStore } from '../../src/ui/store';
import { strings } from '../../src/ui/strings';
import { docWithFlags, fakeDeps, source } from './fixtures';

vi.mock('../../src/imaging/render', () => ({
  renderPage: vi.fn(() => new Promise(() => {})),
  releaseCanvas: vi.fn(),
  getPdf: vi.fn(),
  forgetPdf: vi.fn(async () => {}),
}));
// drawing the code needs a real canvas; the picture tells what it holds
vi.mock('../../src/edit/qrImage', () => ({
  qrImage: vi.fn((text: string) => ({ src: `data:image/png;base64,${btoa(unescape(encodeURIComponent(text)))}`, aspect: 1 })),
}));

const decode = (src: string) => decodeURIComponent(escape(atob(src.split(',')[1])));

function openQr() {
  const store = createAppStore(fakeDeps());
  store.load(docWithFlags(1), [source]);
  render(<App store={store} />);
  act(() => store.openPreview('p1'));
  vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 1000); // past the preview's ghost-click guard
  fireEvent.click(screen.getByRole('button', { name: strings.edit }));
  fireEvent.click(screen.getByRole('button', { name: strings.toolsMore }));
  fireEvent.click(screen.getByRole('button', { name: strings.qrTool }));
  return { store, sheet: screen.getByRole('dialog', { name: strings.qrTitle }) };
}

describe('Kod QR', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('link: typed, previewed, and put on the page as a square that can be moved (undoable)', () => {
    const { store, sheet } = openQr();
    const insert = within(sheet).getByRole('button', { name: strings.qrInsert }) as HTMLButtonElement;
    expect(insert.disabled).toBe(true);
    fireEvent.change(within(sheet).getByRole('textbox', { name: strings.qrText }), { target: { value: 'https://kaczka.pl' } });
    expect(within(sheet).getByRole('img', { name: strings.qrPreview })).toBeTruthy();
    fireEvent.click(insert);
    expect(screen.queryByRole('dialog', { name: strings.qrTitle })).toBeNull();
    const st = store.getState().doc.pages[0].stamps!;
    expect(st).toHaveLength(1);
    expect(decode(st[0].src)).toBe('https://kaczka.pl');
    act(() => store.undo());
    expect(store.getState().doc.pages[0].stamps ?? []).toHaveLength(0);
  });

  it('przelew: a wrong account says so; a good one makes the bank code; the recipient and account are remembered', () => {
    const { store, sheet } = openQr();
    fireEvent.click(within(sheet).getByRole('button', { name: strings.qrKindPay }));
    const field = (name: string) => within(sheet).getByRole('textbox', { name });
    fireEvent.change(field(strings.qrPayName), { target: { value: 'Kaczka' } });
    fireEvent.change(field(strings.qrPayAccount), { target: { value: '61 1090' } });
    expect(within(sheet).getByText(strings.qrBadAccount)).toBeTruthy();
    fireEvent.change(field(strings.qrPayAccount), { target: { value: '61 1090 1014 0000 0712 1981 2874' } });
    fireEvent.change(field(strings.qrPayAmount), { target: { value: '99,90' } });
    fireEvent.change(field(strings.qrPayTitle), { target: { value: 'FV 1' } });
    fireEvent.click(within(sheet).getByRole('button', { name: strings.qrInsert }));
    expect(decode(store.getState().doc.pages[0].stamps![0].src)).toBe('|PL|61109010140000071219812874|009990|Kaczka|FV 1|||');
    // next time: the recipient and the account are filled in, the amount and title are not
    fireEvent.click(screen.getByRole('button', { name: strings.toolsMore }));
    fireEvent.click(screen.getByRole('button', { name: strings.qrTool }));
    const again = screen.getByRole('dialog', { name: strings.qrTitle });
    expect(within(again).getByRole('button', { name: strings.qrKindPay }).getAttribute('aria-pressed')).toBe('true');
    expect((within(again).getByRole('textbox', { name: strings.qrPayName }) as HTMLInputElement).value).toBe('Kaczka');
    expect((within(again).getByRole('textbox', { name: strings.qrPayAmount }) as HTMLInputElement).value).toBe('');
  });

  it('wizytówka: name and phone make a contact card', () => {
    const { store, sheet } = openQr();
    fireEvent.click(within(sheet).getByRole('button', { name: strings.qrKindCard }));
    fireEvent.change(within(sheet).getByRole('textbox', { name: strings.qrCardName }), { target: { value: 'Jan Kowalski' } });
    fireEvent.change(within(sheet).getByRole('textbox', { name: strings.qrCardPhone }), { target: { value: '600 100 200' } });
    fireEvent.click(within(sheet).getByRole('button', { name: strings.qrInsert }));
    expect(decode(store.getState().doc.pages[0].stamps![0].src)).toContain('FN:Jan Kowalski');
  });
});
