/**
 * Messenger, Facebook and Instagram open links in their own built-in browser (a WebView). It
 * silently drops downloads of generated files, can't install the app and has separate storage,
 * so WDuck asks the user to switch to the real browser.
 */
export type InAppPlatform = 'android' | 'ios';

const IN_APP = /FBAN|FBAV|FB_IAB|FBIOS|Messenger|Instagram/;

export function detectInAppBrowser(ua: string): InAppPlatform | null {
  if (!IN_APP.test(ua)) return null;
  if (/Android/.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios';
  return null;
}

/** Android intent link that reopens the same address (without the #fragment) in Chrome. */
export function chromeIntentUrl(href: string): string {
  const u = new URL(href);
  const plain = `${u.origin}${u.pathname}${u.search}`;
  return (
    `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=${u.protocol.replace(':', '')};` +
    `package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(plain)};end`
  );
}
