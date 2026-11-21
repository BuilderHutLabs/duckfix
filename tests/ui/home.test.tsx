import { fireEvent, render, screen } from '@testing-library/react';
import { App } from '../../src/ui/App';
import { createAppStore } from '../../src/ui/store';
import { strings } from '../../src/ui/strings';
import { fakeDeps } from './fixtures';

describe('Home screen', () => {
  it('shows the icon, title, description, steps and the open button', () => {
    render(<App store={createAppStore(fakeDeps())} />);
    expect(screen.getByRole('heading', { name: strings.appName })).toBeTruthy();
    expect(screen.getByRole('button', { name: strings.open })).toBeTruthy();
    expect(
      screen.getByText('Skanuj aparatem, łącz pliki i popraw krzywe strony. Zapisz jeden czysty PDF.'),
    ).toBeTruthy();
    for (const step of ['1. Otwórz', '2. Sprawdź', '3. Zapisz']) {
      expect(screen.getByText(step)).toBeTruthy();
    }
    // the duck logo (animated SVG) replaces the static icon image
    expect(document.querySelector('.home .duck svg')).not.toBeNull();
  });

  it('says that several files are merged into one PDF, and the picker takes several files', () => {
    render(<App store={createAppStore(fakeDeps())} />);
    expect(screen.getByRole('button', { name: 'Wybierz pliki' })).toBeTruthy();
    expect(screen.getByText(strings.mergeHint)).toBeTruthy();
    const picker = document.querySelector('.home input[type=file]:not([capture])') as HTMLInputElement;
    expect(picker.multiple).toBe(true);
  });

  it('settings popover closes on outside pointerdown and on Escape', () => {
    render(<App store={createAppStore(fakeDeps())} />);
    const gear = () => screen.getByRole('button', { name: strings.settings });
    fireEvent.click(gear());
    expect(screen.getByRole('checkbox', { name: strings.deskew })).toBeTruthy();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('checkbox', { name: strings.deskew })).toBeNull();
    fireEvent.click(gear());
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('checkbox', { name: strings.deskew })).toBeNull();
  });
});

describe('privacy note', () => {
  it('the home screen says the files stay on the device', () => {
    render(<App store={createAppStore(fakeDeps())} />);
    expect(screen.getByText(strings.privacyNote)).toBeTruthy();
  });
});
