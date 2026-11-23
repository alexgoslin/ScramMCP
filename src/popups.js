// Which links may open a sign-in window inside Scram Desktop (see main.js: windows there have no
// address bar, so anything else opens in the person's browser, which shows the address).
//
// - A known sign-in provider (Google, Microsoft, Apple, GitHub, Auth0, Clerk, Okta): yes.
// - Another sign-in page (or a blank window a sign-in script fills in): only when Scram's own page
//   opened it. Not the app in the Run preview, and not a page that hides where it came from (no
//   referrer), so a page can't open a window that only looks like a sign-in page.

const SIGN_IN_SITE =
  /^https:\/\/(accounts\.google\.com|login\.microsoftonline\.com|login\.live\.com|github\.com\/login|appleid\.apple\.com|[a-z0-9-]+(\.[a-z]{2})?\.auth0\.com|[a-z0-9-]+\.clerk\.accounts\.dev|[a-z0-9-]+\.(okta|oktapreview|okta-emea)\.com)\//i;
const SIGN_IN_PATH = /\/(oauth2?|authorize|sso|signin|sign-in|login)\b/i;

export function popupAllowed(url, opener, isScram) {
  if (SIGN_IN_SITE.test(url)) return true;
  if (!isScram(opener)) return false;
  if (url === "about:blank") return true; // (sign-in scripts open a blank window, then fill it in)
  try {
    const u = new URL(url);
    return u.protocol === "https:" && SIGN_IN_PATH.test(u.pathname);
  } catch {
    return false;
  }
}

