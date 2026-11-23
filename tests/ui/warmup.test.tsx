import { act, render, screen } from '@testing-library/react';
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

const detector = { detect: vi.fn(), dispose: vi.fn(async () => {}) };

describe('the text recognition starts early', () => {
  afterEach(() => vi.useRealTimers());

  it('on the home screen it starts by itself a moment after the app opens; a document then uses it at once', async () => {
    vi.useFakeTimers();
    const createDetector = vi.fn(async () => detector);
    const deps = fakeDeps({ createDetector });
    const store = createAppStore(deps);
    render(<App store={store} />);
    expect(createDetector).not.toHaveBeenCalled(); // not while the app is starting
    await act(async () => vi.advanceTimersByTime(3000));
    expect(createDetector).toHaveBeenCalledTimes(1);
    await act(async () => store.load({ pages: [page('a', { analyzed: false, autoRotation: null })] }, [source]));
    expect(createDetector).toHaveBeenCalledTimes(1);
  });

  it('while it is still getting ready, the progress says so instead of a stuck "0/1"', async () => {
    let ready: (d: typeof detector) => void = () => {};
    const createDetector = vi.fn(() => new Promise<typeof detector>((r) => (ready = r)));
    const store = createAppStore(fakeDeps({ createDetector }));
    render(<App store={store} />);
    act(() => store.load({ pages: [page('a', { analyzed: false, autoRotation: null })] }, [source]));
    expect(await screen.findByText(strings.preparingRecognition)).toBeTruthy();
    await act(async () => ready(detector));
    expect(screen.queryByText(strings.preparingRecognition)).toBeNull();
  });

  it('an early start that fails (no internet the first time) says nothing; opening a document tries again', async () => {
    vi.useFakeTimers();
    const createDetector = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(detector);
    const store = createAppStore(fakeDeps({ createDetector }));
    render(<App store={store} />);
    await act(async () => vi.advanceTimersByTime(3000));
    expect(store.getState().error).toBeNull();
    await act(async () => store.load({ pages: [page('a', { analyzed: false, autoRotation: null })] }, [source]));
    await act(async () => {});
    expect(createDetector).toHaveBeenCalledTimes(2);
  });
});
