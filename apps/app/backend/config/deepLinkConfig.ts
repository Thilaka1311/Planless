export interface DeepLinkConfig {
  appleTeamId: string;
  appleBundleId: string;
  androidPackageName: string;
  androidSha256Fingerprints: string[];
}

export function getDeepLinkConfig(): DeepLinkConfig {
  const appleTeamId = process.env.APPLE_TEAM_ID?.trim() || "TEAM_ID";
  const appleBundleId = process.env.APPLE_BUNDLE_ID?.trim() || "app.planless";
  const androidPackageName = process.env.ANDROID_PACKAGE_NAME?.trim() || "app.planless";
  
  const rawFingerprints = process.env.ANDROID_SHA256_FINGERPRINTS?.trim();
  const androidSha256Fingerprints = rawFingerprints
    ? rawFingerprints.split(",").map((f) => f.trim()).filter(Boolean)
    : [
        "14:6D:E9:D4:58:EA:3A:99:6D:77:24:A4:44:81:4D:42:3B:56:56:4C:E6:86:14:02:69:B6:BA:55:1A:4C:7C:F4"
      ];

  return {
    appleTeamId,
    appleBundleId,
    androidPackageName,
    androidSha256Fingerprints,
  };
}

/**
 * Builds the Apple App Site Association JSON payload dynamically.
 */
export function getAppleAppSiteAssociation(): object {
  const config = getDeepLinkConfig();
  const appId = `${config.appleTeamId}.${config.appleBundleId}`;

  return {
    applinks: {
      apps: [],
      details: [
        {
          appIDs: [appId],
          components: [
            {
              "/": "/join/*",
              comment: "Matches invite links: https://planless.app/join/<planId>"
            }
          ]
        },
        {
          appID: appId,
          paths: ["/join/*"]
        }
      ]
    },
    webcredentials: {
      apps: [appId]
    }
  };
}

/**
 * Builds the Android Asset Links JSON payload dynamically.
 */
export function getAndroidAssetLinks(): object[] {
  const config = getDeepLinkConfig();

  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: config.androidPackageName,
        sha256_cert_fingerprints: config.androidSha256Fingerprints,
      }
    }
  ];
}
