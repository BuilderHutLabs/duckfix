import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { chromeIntentUrl, detectInAppBrowser } from '../../src/ui/inAppBrowser';
import { App } from '../../src/ui/App';
import { createAppStore } from '../../src/ui/store';
import { strings } from '../../src/ui/strings';
import { fakeDeps } from './fixtures';

const UA = {
  messengerAndroid:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0 Mobile Safari/537.36 [FB_IAB/Orca-Android;FBAV/480.0.0.40.109;]',
  facebookIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/460.0.0.40.104;FBBV/123;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/17.4;FBSS/3;FBCR/;FBID/phone;FBLC/pl_PL;FBOP/5]',
  instagramAndroid:
    'Mozilla/5.0 (Linux; Android 13; SM-S911B; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0 Mobile Safari/537.36 Instagram 320.0.0.34.109 Android',
  chromeAndroid: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36',
  safariIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  chromeWindows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36',
};

afterEach(() => vi.unstubAllGlobals());

describe('detectInAppBrowser', () => {
  it('recognises Messenger/Facebook/Instagram in-app browsers and their platform', () => {
    expect(detectInAppBrowser(UA.messengerAndroid)).toBe('android');
    expect(detectInAppBrowser(UA.instagramAndroid)).toBe('android');
    expect(detectInAppBrowser(UA.facebookIos)).toBe('ios');
  });

  it('is null in real browsers', () => {
    expect(detectInAppBrowser(UA.chromeAndroid)).toBeNull();
    expect(detectInAppBrowser(UA.safariIos)).toBeNull();
    expect(detectInAppBrowser(UA.chromeWindows)).toBeNull();
  });
});

describe('chromeIntentUrl', () => {
  it('builds an Android intent that opens the same address in Chrome', () => {
    expect(chromeIntentUrl('https://builderhutlabs.github.io/wduck/?x=1#diag')).toBe(
      'intent://builderhutlabs.github.io/wduck/?x=1#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=https%3A%2F%2Fbuilderhutlabs.github.io%2Fwduck%2F%3Fx%3D1;end',
    );
  });
});

describe('in-app browser banner', () => {
  const renderWith = (ua: string) => {
    vi.stubGlobal('navigator', { ...navigator, userAgent: ua });
    render(<App store={createAppStore(fakeDeps())} />);
  };

  it('on Android Messenger shows the warning with an "Otwórz w Chrome" link', () => {
    renderWith(UA.messengerAndroid);
    expect(screen.getByText(strings.inAppWarning)).toBeTruthy();
    const link = screen.getByRole('link', { name: strings.openInChrome });
    expect(link.getAttribute('href')).toMatch(/^intent:\/\/.*package=com\.android\.chrome/);
  });

  it('on iOS Facebook shows the warning with the Safari hint and no link', () => {
    renderWith(UA.facebookIos);
    expect(screen.getByText(strings.inAppWarning)).toBeTruthy();
    expect(screen.getByText(strings.openInSafariHint)).toBeTruthy();
    expect(screen.queryByRole('link', { name: strings.openInChrome })).toBeNull();
  });

  it('is not shown in a normal browser', () => {
    renderWith(UA.chromeAndroid);
    expect(screen.queryByText(strings.inAppWarning)).toBeNull();
  });
});
