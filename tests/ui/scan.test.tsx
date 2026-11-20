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
