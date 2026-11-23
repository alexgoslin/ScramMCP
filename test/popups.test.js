// Which links may open a sign-in window inside Scram Desktop (its windows have no address bar).

import { test } from "node:test";
import assert from "node:assert/strict";
import { popupAllowed } from "../src/popups.js";
import { scramUrls } from "../src/scram/urls.js";

const { isScram } = scramUrls(""); // the real Scram addresses
const SCRAM = "https://editor.buildwithscram.com/";
const PREVIEW = "https://my-bakery-app.scram-preview.example/"; // the app in the Run preview

test("known sign-in providers open in a window, whoever opened them", () => {
  for (const url of ["https://accounts.google.com/o/oauth2/v2/auth?x=1", "https://login.microsoftonline.com/common/oauth2", "https://appleid.apple.com/auth/authorize", "https://scram.eu.auth0.com/authorize", "https://scram.clerk.accounts.dev/sign-in"]) {
    assert.ok(popupAllowed(url, PREVIEW, isScram), url);
    assert.ok(popupAllowed(url, "", isScram), url);
  }
});

test("other sign-in pages only when Scram's own page opened them", () => {
  assert.ok(popupAllowed("https://sso.example-company.com/login", SCRAM, isScram));
  assert.ok(popupAllowed("about:blank", SCRAM, isScram));
  // The app in the preview, or a page hiding where it came from, can't open a lookalike.
  assert.ok(!popupAllowed("https://evil.example/login", PREVIEW, isScram));
  assert.ok(!popupAllowed("https://evil.example/sso/start", "", isScram));
  assert.ok(!popupAllowed("about:blank", PREVIEW, isScram));
  assert.ok(!popupAllowed("about:blank", "", isScram));
  // Lookalike provider addresses don't count as providers.
  assert.ok(!popupAllowed("https://evilclerk.com/sign-in", PREVIEW, isScram));
  assert.ok(!popupAllowed("https://clerk.evil.example/sign-in", PREVIEW, isScram));
  assert.ok(!popupAllowed("https://accounts.google.com.evil.example/", PREVIEW, isScram));
  // Not a sign-in page, or not https: no window, even from Scram.
  assert.ok(!popupAllowed("https://docs.example.com/guide", SCRAM, isScram));
  assert.ok(!popupAllowed("http://sso.example-company.com/login", SCRAM, isScram));
});
