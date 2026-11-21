import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App } from '../../src/ui/App';
import { createAppStore } from '../../src/ui/store';
import { strings } from '../../src/ui/strings';
import { fakeDeps, page, source } from './fixtures';

vi.mock('../../src/imaging/render', () => ({
  renderPage: vi.fn(() => new Promise(() => {})),
  releaseCanvas: vi.fn(),
  getPdf: vi.fn(),
  forgetPdf: vi.fn(async () => {}),
}));
// decoding and the perspective warp need a real canvas; jsdom has none
vi.mock('../../src/scan/warp', () => ({
  loadPhoto: vi.fn(async () => ({ width: 4000, height: 3000, url: 'blob:photo', bitmap: {}, close: vi.fn() })),
  findSheet: vi.fn(() => null),
  warpToBlob: vi.fn(async () => new Blob(['jpg'], { type: 'image/jpeg' })),
  warpPreview: vi.fn(async () => 'blob:preview'),
}));

const photo = () => new File(['x'], 'IMG_0001.jpg', { type: 'image/jpeg' });

function cameraInput(): HTMLInputElement {
  return document.querySelector('input[capture]') as HTMLInputElement;
}

async function takePhoto() {
  await act(async () => {
    fireEvent.change(cameraInput(), { target: { files: [photo()] } });
  });
}

describe('camera scan', () => {
  it('Home offers "Zrób zdjęcie" that opens the rear camera', () => {
    render(<App store={createAppStore(fakeDeps())} />);
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    fireEvent.click(screen.getByRole('button', { name: strings.takePhoto }));
    expect(click).toHaveBeenCalled();
    expect(cameraInput().getAttribute('capture')).toBe('environment');
    expect(cameraInput().getAttribute('accept')).toBe('image/*');
    click.mockRestore();
  });

  it('a photo opens the crop screen with 4 corners; Gotowe adds the straightened page', async () => {
    const deps = fakeDeps({
      importFiles: vi.fn(async () => ({ sources: [source], pages: [page('s1', { analyzed: false, autoRotation: null })] })),
    });
    render(<App store={createAppStore(deps)} />);
    await takePhoto();
    expect(await screen.findByRole('dialog', { name: strings.cropTitle })).toBeTruthy();
    expect(screen.getAllByRole('slider')).toHaveLength(4);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: strings.cropDone })));
    await waitFor(() => expect(deps.importFiles).toHaveBeenCalledTimes(1));
    const [files] = vi.mocked(deps.importFiles).mock.calls[0];
    expect(files).toHaveLength(1);
    expect(files[0].name.startsWith(strings.scanName)).toBe(true);
    expect(files[0].type).toBe('image/jpeg');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: strings.cropTitle })).toBeNull());
    expect(screen.getByRole('button', { name: strings.save })).toBeTruthy(); // review screen
  });

  it('"Następna strona" saves this page and opens the camera again', async () => {
    const deps = fakeDeps();
    render(<App store={createAppStore(deps)} />);
    await takePhoto();
    await screen.findByRole('dialog', { name: strings.cropTitle });
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    await act(async () => fireEvent.click(screen.getByRole('button', { name: strings.cropNext })));
    expect(click).toHaveBeenCalled();
    await waitFor(() => expect(deps.importFiles).toHaveBeenCalledTimes(1));
    click.mockRestore();
  });

  it('the camera tile is off while a PDF is being saved (a photo then would be lost)', async () => {
    const deps = fakeDeps({ exportPdf: vi.fn(() => new Promise<Uint8Array>(() => {})) });
    const store = createAppStore(deps);
    store.load({ pages: [page('p1')] }, [source]);
    render(<App store={store} />);
    const tile = () => screen.getAllByRole('button', { name: strings.takePhoto })[0] as HTMLButtonElement;
    expect(tile().disabled).toBe(false);
    act(() => void store.export({ compress: false, ocr: false }));
    expect(tile().disabled).toBe(true);
  });

  it('one photo from "Wybierz pliki" (Android offers the camera there too) also goes through the crop screen', async () => {
    const deps = fakeDeps();
    render(<App store={createAppStore(deps)} />);
    const picker = document.querySelector('.home input[type=file]:not([capture])') as HTMLInputElement;
    await act(async () => fireEvent.change(picker, { target: { files: [photo()] } }));
    expect(await screen.findByRole('dialog', { name: strings.cropTitle })).toBeTruthy();
    expect(deps.importFiles).not.toHaveBeenCalled();
  });

  it('a PDF or several photos from the picker are added straight away', async () => {
    const deps = fakeDeps();
    render(<App store={createAppStore(deps)} />);
    const picker = document.querySelector('.home input[type=file]:not([capture])') as HTMLInputElement;
    await act(async () => fireEvent.change(picker, { target: { files: [photo(), photo()] } }));
    expect(screen.queryByRole('dialog', { name: strings.cropTitle })).toBeNull();
    await waitFor(() => expect(deps.importFiles).toHaveBeenCalledTimes(1));
  });

  it('a photo inserted with "+" between pages lands at that place after cropping', async () => {
    const deps = fakeDeps();
    const store = createAppStore(deps);
    store.load({ pages: [page('p1'), page('p2')] }, [source]);
    render(<App store={store} />);
    const picker = document.querySelector('.grid-wrap input[type=file]') as HTMLInputElement;
    store.setScanPhoto(photo(), 1);
    await screen.findByRole('dialog', { name: strings.cropTitle });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: strings.cropDone })));
    await waitFor(() => expect(deps.importFiles).toHaveBeenCalledTimes(1));
    expect(picker).not.toBeNull();
    await waitFor(() => expect(store.getState().doc.pages.map((p) => p.id)).toEqual(['p1', 'n1', 'p2']));
  });

  it('the crop screen offers Kolor / Wybielony / Czarno-biały (Wybielony first time); the choice is used and remembered', async () => {
    const { warpToBlob } = await import('../../src/scan/warp');
    localStorage.clear();
    render(<App store={createAppStore(fakeDeps())} />);
    await takePhoto();
    await screen.findByRole('dialog', { name: strings.cropTitle });
    const opt = (name: string) => screen.getByRole('button', { name });
    expect(opt(strings.filterWhiten).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(opt(strings.filterBw));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: strings.cropDone })));
    expect(vi.mocked(warpToBlob).mock.calls.at(-1)![2]).toBe('bw');
    await takePhoto();
    await screen.findByRole('dialog', { name: strings.cropTitle });
    expect(opt(strings.filterBw).getAttribute('aria-pressed')).toBe('true');
  });

  it('a small preview shows the straightened page with the chosen look, and follows the choice', async () => {
    const { warpPreview } = await import('../../src/scan/warp');
    localStorage.clear();
    render(<App store={createAppStore(fakeDeps())} />);
    await takePhoto();
    await screen.findByRole('dialog', { name: strings.cropTitle });
    const img = await screen.findByRole('img', { name: strings.cropPreview });
    expect(img.getAttribute('src')).toBe('blob:preview');
    expect(vi.mocked(warpPreview).mock.calls.at(-1)![2]).toBe('whiten');
    fireEvent.click(screen.getByRole('button', { name: strings.filterBw }));
    await waitFor(() => expect(vi.mocked(warpPreview).mock.calls.at(-1)![2]).toBe('bw'));
  });

  it('Anuluj closes the crop screen without adding anything', async () => {
    const deps = fakeDeps();
    render(<App store={createAppStore(deps)} />);
    await takePhoto();
    await screen.findByRole('dialog', { name: strings.cropTitle });
    fireEvent.click(screen.getByRole('button', { name: strings.cancel }));
    expect(screen.queryByRole('dialog', { name: strings.cropTitle })).toBeNull();
    expect(deps.importFiles).not.toHaveBeenCalled();
  });
});
