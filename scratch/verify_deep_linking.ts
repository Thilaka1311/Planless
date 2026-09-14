import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import express from "express";
import {
  getDeepLinkConfig,
  getAppleAppSiteAssociation,
  getAndroidAssetLinks
} from "../apps/app/backend/config/deepLinkConfig.ts";
import {
  extractInviteTokenFromPath,
  buildInviteUrl
} from "../apps/app/src/features/plans/services/planInviteService.ts";

console.log("=== PLANLESS DEEP LINKING VERIFICATION SUITE ===\n");

// 1. Static .well-known Files Verification
console.log("1. Verifying static .well-known files...");

const aasaAppsPath = path.resolve("./apps/app/public/.well-known/apple-app-site-association");
const aasaRootPath = path.resolve("./public/.well-known/apple-app-site-association");
const assetlinksAppsPath = path.resolve("./apps/app/public/.well-known/assetlinks.json");
const assetlinksRootPath = path.resolve("./public/.well-known/assetlinks.json");

assert(fs.existsSync(aasaAppsPath), "apps/app/public/.well-known/apple-app-site-association must exist");
assert(fs.existsSync(aasaRootPath), "public/.well-known/apple-app-site-association must exist");
assert(fs.existsSync(assetlinksAppsPath), "apps/app/public/.well-known/assetlinks.json must exist");
assert(fs.existsSync(assetlinksRootPath), "public/.well-known/assetlinks.json must exist");

const aasaContent = JSON.parse(fs.readFileSync(aasaAppsPath, "utf-8"));
assert(aasaContent.applinks, "AASA must contain 'applinks'");
assert(Array.isArray(aasaContent.applinks.details), "AASA applinks must contain 'details' array");
const details = aasaContent.applinks.details;
const modernDetail = details.find((d: any) => d.components);
assert(modernDetail, "AASA must contain modern 'components' format");
assert(modernDetail.components.some((c: any) => c["/"] === "/join/*"), "AASA must contain /join/* component pattern");

const assetlinksContent = JSON.parse(fs.readFileSync(assetlinksAppsPath, "utf-8"));
assert(Array.isArray(assetlinksContent), "assetlinks.json must be a JSON array");
assert(assetlinksContent.length > 0, "assetlinks.json must not be empty");
assert(assetlinksContent[0].relation.includes("delegate_permission/common.handle_all_urls"), "assetlinks must declare handle_all_urls");
assert(assetlinksContent[0].target.namespace === "android_app", "assetlinks target namespace must be android_app");

console.log("   ✓ Static .well-known files are present and match Apple/Android specifications.\n");

// 2. Vercel Configuration Verification
console.log("2. Verifying vercel.json headers and rewrites...");

const vercelConfigPath = path.resolve("./vercel.json");
assert(fs.existsSync(vercelConfigPath), "vercel.json must exist at repository root");
const vercelConfig = JSON.parse(fs.readFileSync(vercelConfigPath, "utf-8"));

// Verify headers
const aasaHeader = vercelConfig.headers.find((h: any) => h.source === "/.well-known/apple-app-site-association");
assert(aasaHeader, "vercel.json must have headers for /.well-known/apple-app-site-association");
const aasaCt = aasaHeader.headers.find((kv: any) => kv.key === "Content-Type");
assert.strictEqual(aasaCt?.value, "application/json", "AASA Content-Type must be application/json");

const assetlinksHeader = vercelConfig.headers.find((h: any) => h.source === "/.well-known/assetlinks.json");
assert(assetlinksHeader, "vercel.json must have headers for /.well-known/assetlinks.json");
const assetlinksCt = assetlinksHeader.headers.find((kv: any) => kv.key === "Content-Type");
assert.strictEqual(assetlinksCt?.value, "application/json", "assetlinks Content-Type must be application/json");

// Verify rewrites
const rewrites = vercelConfig.rewrites;
assert(Array.isArray(rewrites), "vercel.json must define rewrites");

const wellKnownRewrite = rewrites.find((r: any) => r.source === "/.well-known/:path*");
assert(wellKnownRewrite, "vercel.json must preserve /.well-known/:path*");
assert.strictEqual(wellKnownRewrite.destination, "/.well-known/:path*");

const joinRewrite = rewrites.find((r: any) => r.source === "/join/:planId");
assert(joinRewrite, "vercel.json must route /join/:planId to /index.html fallback");
assert.strictEqual(joinRewrite.destination, "/index.html");

console.log("   ✓ vercel.json properly configures MIME types and SPA fallback for deep links.\n");

// 3. Dynamic Backend Config & Environment Variable Support
console.log("3. Verifying dynamic deepLinkConfig...");

const defaultConfig = getDeepLinkConfig();
assert.strictEqual(defaultConfig.appleTeamId, "TEAM_ID");
assert.strictEqual(defaultConfig.appleBundleId, "app.planless");
assert.strictEqual(defaultConfig.androidPackageName, "app.planless");

// Test with environment variables overridden
process.env.APPLE_TEAM_ID = "XYZ9876543";
process.env.APPLE_BUNDLE_ID = "com.custom.planless";
process.env.ANDROID_PACKAGE_NAME = "com.custom.planless.android";
process.env.ANDROID_SHA256_FINGERPRINTS = "AA:BB:CC:DD,11:22:33:44";

const customAasa: any = getAppleAppSiteAssociation();
assert(customAasa.applinks.details.some((d: any) => d.appIDs?.includes("XYZ9876543.com.custom.planless")));
assert(customAasa.applinks.details.some((d: any) => d.appID === "XYZ9876543.com.custom.planless"));

const customAssetlinks: any = getAndroidAssetLinks();
assert.strictEqual(customAssetlinks[0].target.package_name, "com.custom.planless.android");
assert.deepStrictEqual(customAssetlinks[0].target.sha256_cert_fingerprints, ["AA:BB:CC:DD", "11:22:33:44"]);

// Reset env
delete process.env.APPLE_TEAM_ID;
delete process.env.APPLE_BUNDLE_ID;
delete process.env.ANDROID_PACKAGE_NAME;
delete process.env.ANDROID_SHA256_FINGERPRINTS;

console.log("   ✓ Dynamic config supports environment variable overrides correctly.\n");

// 4. Express Server Local Testing
console.log("4. Verifying Express server deep-link routes locally...");

const testApp = express();
testApp.get(["/.well-known/apple-app-site-association", "/apple-app-site-association"], (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "public, max-age=3600, must-revalidate");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.json(getAppleAppSiteAssociation());
});
testApp.get("/.well-known/assetlinks.json", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "public, max-age=3600, must-revalidate");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.json(getAndroidAssetLinks());
});

const server = http.createServer(testApp);

await new Promise<void>((resolve) => {
  server.listen(0, "127.0.0.1", async () => {
    const port = (server.address() as any).port;
    const baseUrl = `http://127.0.0.1:${port}`;

    // Test AASA
    const resAasa = await fetch(`${baseUrl}/.well-known/apple-app-site-association`);
    assert.strictEqual(resAasa.status, 200);
    assert.strictEqual(resAasa.headers.get("content-type"), "application/json; charset=utf-8");
    const jsonAasa = await resAasa.json();
    assert(jsonAasa.applinks);

    // Test root AASA fallback
    const resAasaRoot = await fetch(`${baseUrl}/apple-app-site-association`);
    assert.strictEqual(resAasaRoot.status, 200);
    assert.strictEqual(resAasaRoot.headers.get("content-type"), "application/json; charset=utf-8");

    // Test AssetLinks
    const resAsset = await fetch(`${baseUrl}/.well-known/assetlinks.json`);
    assert.strictEqual(resAsset.status, 200);
    assert.strictEqual(resAsset.headers.get("content-type"), "application/json; charset=utf-8");
    const jsonAsset = await resAsset.json();
    assert(Array.isArray(jsonAsset));

    server.close(() => resolve());
  });
});

console.log("   ✓ Express server serves .well-known routes with HTTP 200 and Content-Type: application/json.\n");

// 5. URL Extraction & Development Isolation Verification
console.log("5. Verifying URL parsing & dev/prod isolation...");

const testPlanId = "446b856b-313d-4c57-897d-bb6d1945d82f";

// Valid join links
assert.strictEqual(extractInviteTokenFromPath(`/join/${testPlanId}`), testPlanId);
assert.strictEqual(extractInviteTokenFromPath(`/join/${testPlanId}/`), testPlanId);
assert.strictEqual(extractInviteTokenFromPath(`join/${testPlanId}`), testPlanId);

// Non-join links
assert.strictEqual(extractInviteTokenFromPath(`/home`), null);
assert.strictEqual(extractInviteTokenFromPath(`/plans/${testPlanId}`), null);
assert.strictEqual(extractInviteTokenFromPath(`/`), null);
assert.strictEqual(extractInviteTokenFromPath(null), null);

// In Node environment without window.location:
const builtUrl = buildInviteUrl(testPlanId);
assert.strictEqual(builtUrl, `https://planless.app/join/${testPlanId}`);

console.log("   ✓ Invite URL extraction and URL building behave correctly.\n");

// 6. Native Artifacts Verification
console.log("6. Verifying native entitlements and intent filters...");

const iosEntitlements = fs.readFileSync(path.resolve("./native/ios/Planless.entitlements"), "utf-8");
assert(iosEntitlements.includes("applinks:planless.app"), "iOS entitlements must contain applinks:planless.app");

const androidSnippet = fs.readFileSync(path.resolve("./native/android/AndroidManifest.snippet.xml"), "utf-8");
assert(androidSnippet.includes('android:host="planless.app"'), "Android snippet must configure host planless.app");
assert(androidSnippet.includes('android:pathPrefix="/join/"'), "Android snippet must configure pathPrefix /join/");
assert(androidSnippet.includes('android:autoVerify="true"'), "Android snippet must specify autoVerify=true");

console.log("   ✓ Native configuration files are verified.\n");

console.log("==================================================");
console.log("ALL DEEP LINKING VERIFICATIONS PASSED SUCCESSFULLY!");
console.log("==================================================");
