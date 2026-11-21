import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App } from '../../src/ui/App';
import { createAppStore } from '../../src/ui/store';
import { strings } from '../../src/ui/strings';
import { storageKey } from '../../src/config';
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

// what the live camera "sees" in each frame (a real canvas is needed for that)
const frame = vi.hoisted(() => ({ current: null as null | { quad: unknown; width: number; height: number; light: number } }));
vi.mock('../../src/scan/liveFrame', () => ({ analyzeFrame: vi.fn(() => frame.current) }));
const fullSheet = {
  quad: [
    { x: 40, y: 20 },
    { x: 360, y: 20 },
    { x: 360, y: 280 },
    { x: 40, y: 280 },
  ],
  width: 400,
  height: 300,
  light: 150,
};

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
    fireEvent.click(screen.getByRole('button', { name: strings.homeScan }));
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
    act(() => void store.export({ compress: false, ocr: false, format: 'pdf' }));
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

describe('built-in camera', () => {
  const stop = vi.fn();
  const applyConstraints = vi.fn(async () => {});
  const track = { stop, applyConstraints, getCapabilities: () => ({ torch: true }) };
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] };

  beforeEach(() => {
    stop.mockClear();
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn(async () => stream) },
    });
  });
  afterEach(() => {
    // @ts-expect-error back to jsdom's "no camera API"
    delete navigator.mediaDevices;
    vi.restoreAllMocks();
  });

  it('"Zrób zdjęcie" opens the camera inside the app (the page is not left); ✕ turns it off', async () => {
    render(<App store={createAppStore(fakeDeps())} />);
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    fireEvent.click(screen.getByRole('button', { name: strings.homeScan }));
    expect(click).not.toHaveBeenCalled();
    const cam = await screen.findByRole('dialog', { name: strings.cameraTitle });
    await waitFor(() => expect((screen.getByRole('button', { name: strings.cameraShoot }) as HTMLButtonElement).disabled).toBe(false));
    expect(cam.querySelector('video')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: strings.cameraTorch }));
    await waitFor(() => expect(applyConstraints).toHaveBeenCalledWith({ advanced: [{ torch: true }] }));
    fireEvent.click(screen.getByRole('button', { name: strings.close }));
    expect(screen.queryByRole('dialog', { name: strings.cameraTitle })).toBeNull();
    expect(stop).toHaveBeenCalled();
  });

  async function openLive(deps = fakeDeps()) {
    render(<App store={createAppStore(deps)} />);
    fireEvent.click(screen.getByRole('button', { name: strings.homeScan }));
    await screen.findByRole('dialog', { name: strings.cameraTitle });
    const video = document.querySelector('video') as HTMLVideoElement;
    Object.defineProperty(video, 'videoWidth', { value: 1600 });
    Object.defineProperty(video, 'videoHeight', { value: 1200 });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (cb: BlobCallback) {
      cb(new Blob(['jpg'], { type: 'image/jpeg' }));
    });
    await waitFor(() => expect((screen.getByRole('button', { name: strings.cameraShoot }) as HTMLButtonElement).disabled).toBe(false));
    return deps;
  }
  const shoot = () => act(async () => fireEvent.click(screen.getByRole('button', { name: strings.cameraShoot })));

  beforeEach(() => {
    frame.current = null;
    localStorage.clear();
    localStorage.setItem(storageKey('duckfix-tour2'), '1'); // the duck tour has its own "Dalej" / "Pomiń"
  });

  it('shots stay in the camera; "Gotowe (2)" opens the crop screen page by page', async () => {
    const deps = await openLive();
    await shoot();
    await shoot();
    expect(screen.getByRole('dialog', { name: strings.cameraTitle })).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy(); // count on the thumbnail
    await act(async () => fireEvent.click(screen.getByRole('button', { name: strings.cameraDone(2) })));
    expect(screen.queryByRole('dialog', { name: strings.cameraTitle })).toBeNull();
    await screen.findByRole('dialog', { name: strings.cropTitle });
    expect(screen.getByText(strings.cropPageOf(1, 2))).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: strings.cropNextQueued })));
    expect(await screen.findByText(strings.cropPageOf(2, 2))).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: strings.cropDone })));
    await waitFor(() => expect(deps.importFiles).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: strings.cropTitle })).toBeNull());
  });

  it('"Dodaj wszystkie" adds the rest with the found outline, without asking page by page', async () => {
    const deps = await openLive();
    await shoot();
    await shoot();
    await shoot();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: strings.cameraDone(3) })));
    await screen.findByRole('dialog', { name: strings.cropTitle });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: strings.cropAddAll })));
    await waitFor(() => expect(deps.importFiles).toHaveBeenCalledTimes(3));
    expect(screen.queryByRole('dialog', { name: strings.cropTitle })).toBeNull();
  });

  it('"Pomiń" leaves a photo out', async () => {
    const deps = await openLive();
    await shoot();
    await shoot();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: strings.cameraDone(2) })));
    await screen.findByRole('dialog', { name: strings.cropTitle });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: strings.cropSkip })));
    expect(await screen.findByText(strings.cropPageOf(2, 2))).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: strings.cropDone })));
    await waitFor(() => expect(deps.importFiles).toHaveBeenCalledTimes(1));
  });

  it('✕ with photos taken asks first', async () => {
    await openLive();
    await shoot();
    const ask = vi.spyOn(window, 'confirm').mockReturnValue(false);
    fireEvent.click(screen.getByRole('button', { name: strings.close }));
    expect(ask).toHaveBeenCalledWith(strings.cameraDiscard(1));
    expect(screen.getByRole('dialog', { name: strings.cameraTitle })).toBeTruthy();
  });

  it('the sheet is outlined live and taken by itself when the phone is held still (Auto)', async () => {
    frame.current = fullSheet;
    await openLive();
    expect(screen.getByRole('button', { name: strings.cameraAuto }).getAttribute('aria-pressed')).toBe('true');
    await waitFor(() => expect(document.querySelector('.live-camera-outline polygon')).not.toBeNull());
    expect(await screen.findByRole('button', { name: strings.cameraDone(1) }, { timeout: 3000 })).toBeTruthy();
  });

  it('with Auto off nothing is taken by itself, and the choice is remembered', async () => {
    frame.current = fullSheet;
    await openLive();
    fireEvent.click(screen.getByRole('button', { name: strings.cameraAuto }));
    await new Promise((r) => setTimeout(r, 1500));
    expect(screen.queryByRole('button', { name: strings.cameraDone(1) })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: strings.close }));
    fireEvent.click(screen.getByRole('button', { name: strings.homeScan }));
    expect((await screen.findByRole('button', { name: strings.cameraAuto })).getAttribute('aria-pressed')).toBe('false');
  });

  it('hints: find the sheet, come closer, too dark', async () => {
    frame.current = { ...fullSheet, quad: null };
    await openLive();
    expect(await screen.findByText(strings.hintFind)).toBeTruthy();
    frame.current = { ...fullSheet, quad: [{ x: 180, y: 130 }, { x: 240, y: 130 }, { x: 240, y: 180 }, { x: 180, y: 180 }] };
    expect(await screen.findByText(strings.hintCloser)).toBeTruthy();
    frame.current = { ...fullSheet, quad: null, light: 30 };
    expect(await screen.findByText(strings.hintDark)).toBeTruthy();
  });

  it('when the camera cannot start (no permission), the phone camera is offered', async () => {
    (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('NotAllowedError'));
    render(<App store={createAppStore(fakeDeps())} />);
    fireEvent.click(screen.getByRole('button', { name: strings.homeScan }));
    expect(await screen.findByText(strings.cameraFailed)).toBeTruthy();
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    fireEvent.click(screen.getAllByRole('button', { name: strings.cameraPhone })[0]);
    expect(click).toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: strings.cameraTitle })).toBeNull();
  });
});
