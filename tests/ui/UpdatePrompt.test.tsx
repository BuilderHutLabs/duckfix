import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sw = vi.hoisted(() => ({ needRefresh: false, update: vi.fn() }));
vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [sw.needRefresh, vi.fn()],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: sw.update,
  }),
}));

import { UpdatePrompt } from '../../src/ui/UpdatePrompt';

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
});
