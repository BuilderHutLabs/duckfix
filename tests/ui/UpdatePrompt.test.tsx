import { render, screen, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sw = vi.hoisted(() => ({
  needRefresh: false,
  update: vi.fn(),
  options: undefined as undefined | { onRegisteredSW?: (url: string, r: ServiceWorkerRegistration | undefined) => void },
}));
vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: (options?: typeof sw.options) => {
    sw.options = options;
    return {
      needRefresh: [sw.needRefresh, vi.fn()],
      offlineReady: [false, vi.fn()],
      updateServiceWorker: sw.update,
    };
  },
}));

import { UpdatePrompt, checkForUpdatesOnResume, UPDATE_CHECK_INTERVAL_MS } from '../../src/ui/UpdatePrompt';

describe('UpdatePrompt', () => {
  beforeEach(() => {
    sw.update.mockReset();
  });

  it('renders nothing when no update is waiting', () => {
    sw.needRefresh = false;
    const { container } = render(<UpdatePrompt />);
    expect(container.firstChild).toBeNull();
  });

  it('offers a refresh when a new version is waiting and activates it on click', () => {
    sw.needRefresh = true;
    render(<UpdatePrompt />);
    expect(screen.getByRole('status').textContent).toContain('Dostępna nowa wersja');
    fireEvent.click(screen.getByRole('button', { name: 'Odśwież' }));
    expect(sw.update).toHaveBeenCalledWith(true);
  });

  it('registers an update check on resume via onRegisteredSW', () => {
    sw.needRefresh = false;
    render(<UpdatePrompt />);
    expect(typeof sw.options?.onRegisteredSW).toBe('function');
  });
});

describe('checkForUpdatesOnResume', () => {
  let visibility: DocumentVisibilityState = 'visible';
  let stop: (() => void) | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
  });

  afterEach(() => {
    stop?.();
    stop = undefined;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const resume = () => {
    visibility = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    visibility = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
  };

  it('calls registration.update() on becoming visible, at most every 30 minutes', () => {
    const update = vi.fn(async () => {});
    stop = checkForUpdatesOnResume({ update } as unknown as ServiceWorkerRegistration);

    resume(); // right after registration (which already checked): throttled
    expect(update).not.toHaveBeenCalled();

    vi.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS);
    resume();
    expect(update).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS - 1);
    resume();
    expect(update).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    resume();
    expect(update).toHaveBeenCalledTimes(2);
    expect(UPDATE_CHECK_INTERVAL_MS).toBe(30 * 60 * 1000);
  });

  it('ignores becoming hidden and swallows update failures (offline)', async () => {
    const update = vi.fn(async () => Promise.reject(new Error('offline')));
    stop = checkForUpdatesOnResume({ update } as unknown as ServiceWorkerRegistration);
    vi.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS);
    visibility = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    expect(update).not.toHaveBeenCalled();
    visibility = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    expect(update).toHaveBeenCalledTimes(1);
    await Promise.resolve(); // rejection handled: no unhandled rejection
  });
});
