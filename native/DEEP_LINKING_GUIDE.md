# Planless Production Deep Linking Guide

This guide describes how deep linking for Planless invite links (`https://planless.app/join/<planId>`) is configured across iOS, Android, and Vercel.

---

## Architecture Overview

```
Shared Invite Link: https://planless.app/join/<planId>
                            │
            ┌───────────────┴───────────────┐
     Native App Installed?            App Not Installed?
            │                               │
    ┌───────┴───────┐                       │
   iOS           Android                    ▼
Universal      App Links             Vercel Web App
  Links             │              (/join/:planId SPA)
    │               │                       │
    └───────┬───────┘                       │
            ▼                               ▼
    Planless App Opens             Planless Web App Opens
            │                               │
            └───────────────┬───────────────┘
                            ▼
      Route to /join/:planId Invite Resolution Flow:
        1. Parse planId
        2. If unauthenticated -> Preserves token in localStorage -> Onboarding
        3. If authenticated -> Invoke claim_plan_invite RPC -> Set rsvp_status = INVITED
        4. Refresh Home feed -> Plan appears on Home
        5. Clear token and replace URL cleanly with /home
```

---

## 1. Vercel & Domain Verification (`planless.app`)

When iOS or Android attempts to verify domain ownership, the operating systems make HTTPS GET requests directly to `planless.app`:

### iOS: `/.well-known/apple-app-site-association`
- **Location**: `https://planless.app/.well-known/apple-app-site-association`
- **Fallback**: `https://planless.app/apple-app-site-association`
- **Content-Type**: `application/json` (HTTP 200, no redirects)
- **Format**:
```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appIDs": ["<APPLE_TEAM_ID>.<APPLE_BUNDLE_ID>"],
        "components": [
          {
            "/": "/join/*",
            "comment": "Matches invite links: https://planless.app/join/<planId>"
          }
        ]
      },
      {
        "appID": "<APPLE_TEAM_ID>.<APPLE_BUNDLE_ID>",
        "paths": ["/join/*"]
      }
    ]
  }
}
```

### Android: `/.well-known/assetlinks.json`
- **Location**: `https://planless.app/.well-known/assetlinks.json`
- **Content-Type**: `application/json` (HTTP 200, no redirects)
- **Format**:
```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "<ANDROID_PACKAGE_NAME>",
      "sha256_cert_fingerprints": [
        "<SHA256_CERT_FINGERPRINT>"
      ]
    }
  }
]
```

### Environment Variables on Vercel
You can configure your real native credentials directly in Vercel Project Settings > Environment Variables:
- `APPLE_TEAM_ID` (e.g. `ABCDE12345`)
- `APPLE_BUNDLE_ID` (e.g. `app.planless`)
- `ANDROID_PACKAGE_NAME` (e.g. `app.planless`)
- `ANDROID_SHA256_FINGERPRINTS` (comma-separated, e.g. `14:6D:E9:...`)

---

## 2. iOS Native Setup

### Step 1: Add Entitlements in Xcode
1. Open your iOS Project in Xcode.
2. Select your App Target > **Signing & Capabilities**.
3. Click **+ Capability** and add **Associated Domains**.
4. Add domain entries:
   - `applinks:planless.app`
   - `applinks:www.planless.app`
5. Alternatively, copy the generated file from [Planless.entitlements](file:///Users/thilak/Documents/Planless/Planless%20Repo%20/Planless-2.0/native/ios/Planless.entitlements) into your Xcode target.

### Step 2: Handle Incoming Universal Links in Swift
In your `AppDelegate.swift` or `SceneDelegate.swift`:

```swift
// SceneDelegate.swift
func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    guard userActivity.activityType == NSUserActivityTypeBrowsingWeb,
          let incomingURL = userActivity.webpageURL else {
        return
    }

    // Example incomingURL: https://planless.app/join/3c6a46e1-9f93-4a0a-8671-5fa8c214c72d
    if incomingURL.path.starts(with: "/join/") {
        let planId = incomingURL.path.replacingOccurrences(of: "/join/", with: "")
        // Pass planId to your navigation controller / webview router
        handlePlanInviteDeepLink(planId: planId)
    }
}
```

---

## 3. Android Native Setup

### Step 1: Add Intent Filter to `AndroidManifest.xml`
Place the snippet from [AndroidManifest.snippet.xml](file:///Users/thilak/Documents/Planless/Planless%20Repo%20/Planless-2.0/native/android/AndroidManifest.snippet.xml) inside your main activity in `AndroidManifest.xml`:

```xml
<activity
    android:name=".MainActivity"
    android:exported="true"
    android:launchMode="singleTask">

    <intent-filter>
        <action android:name="android.intent.action.MAIN" />
        <category android:name="android.intent.category.LAUNCHER" />
    </intent-filter>

    <!-- App Links for Planless Invite Links -->
    <intent-filter android:autoVerify="true">
        <action android:name="android.intent.action.VIEW" />
        <category android:name="android.intent.category.DEFAULT" />
        <category android:name="android.intent.category.BROWSABLE" />

        <data
            android:scheme="https"
            android:host="planless.app"
            android:pathPrefix="/join/" />
        <data
            android:scheme="https"
            android:host="www.planless.app"
            android:pathPrefix="/join/" />
    </intent-filter>
</activity>
```

### Step 2: Handle Incoming Deep Link in Kotlin / Java
In your `MainActivity.kt`:

```kotlin
override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    handleIntent(intent)
}

override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    handleIntent(intent)
}

private fun handleIntent(intent: Intent?) {
    val data: Uri? = intent?.data
    if (data != null && data.scheme == "https" && data.host == "planless.app") {
        val path = data.path ?: ""
        if (path.startsWith("/join/")) {
            val planId = path.removePrefix("/join/").trim()
            handlePlanInvite(planId)
        }
    }
}
```

---

## 4. Web Fallback (Vercel)

If the user does not have the native app installed:
1. The browser opens `https://planless.app/join/<planId>`.
2. Vercel matches `/join/:planId` in `vercel.json` and returns `/index.html` (HTTP 200).
3. The React app boots and runs `extractInviteTokenFromPath(window.location.pathname)`.
4. If the user is unauthenticated:
   - Token is persisted in `localStorage.getItem("planless_pending_invite_token")`.
   - `OnboardingFlow` displays sign up / OTP / name & avatar setup.
   - On completion, `handleOnboardingComplete` restores `pendingInviteToken`.
5. If the user is authenticated:
   - `MainApp` receives `pendingInviteToken`.
   - Calls `claimPlanInviteRPC(tokenToProcess)`.
   - Supabase RPC `claim_plan_invite` atomically ensures `plan_participants` row exists with `rsvp_status = 'INVITED'`.
   - `refreshPlans()` updates the home feed.
   - Browser URL is cleanly replaced with `/home`.

---

## 5. Verification Commands

### Test iOS Association:
```bash
curl -i https://planless.app/.well-known/apple-app-site-association
```
*Expected: HTTP 200, Content-Type: application/json, valid JSON with `components: [{"/": "/join/*"}]`.*

### Test Android Asset Links:
```bash
curl -i https://planless.app/.well-known/assetlinks.json
```
*Expected: HTTP 200, Content-Type: application/json, valid JSON array with `handle_all_urls`.*

### Test Web Fallback:
```bash
curl -i https://planless.app/join/test-plan-id-123
```
*Expected: HTTP 200, Content-Type: text/html, returns index.html shell.*
