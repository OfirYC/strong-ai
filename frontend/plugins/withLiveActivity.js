const { withPlugins, withMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const SWIFT_FILENAME = 'LiveActivityWidget.swift';

function withSwiftOverride(config) {
  return withMod(config, {
    platform: 'ios',
    mod: 'xcodeproj',
    action: async config => {
      const iosRoot = config.modRequest.platformProjectRoot;
      const projectRoot = config.modRequest.projectRoot;

      const targetDir = path.join(iosRoot, 'LiveActivity');
      const sourceSwift = path.join(projectRoot, 'native', SWIFT_FILENAME);
      const targetSwift = path.join(targetDir, SWIFT_FILENAME);

      if (!fs.existsSync(targetDir)) {
        console.warn('LiveActivity folder not found yet.');
        return config;
      }

      await fs.promises.copyFile(sourceSwift, targetSwift);

      console.log('🔥 Swift overwritten AFTER LiveActivity creation.');
      return config;
    },
  });
}

function withLiveActivityiPhoneOnly(config) {
  return withMod(config, {
    platform: 'ios',
    mod: 'xcodeproj',
    action: async config => {
      const iosRoot = config.modRequest.platformProjectRoot;
      const infoPlistPath = path.join(iosRoot, 'LiveActivity', 'Info.plist');

      if (!fs.existsSync(infoPlistPath)) {
        console.warn('LiveActivity Info.plist not found, skipping UIDeviceFamily patch.');
        return config;
      }

      let plist = await fs.promises.readFile(infoPlistPath, 'utf8');
      let changed = false;

      if (!plist.includes('UIDeviceFamily')) {
        plist = plist.replace(
          '</dict>\n</plist>',
          '\t<key>UIDeviceFamily</key>\n\t<array>\n\t\t<integer>1</integer>\n\t</array>\n</dict>\n</plist>'
        );
        changed = true;
        console.log('✅ LiveActivity extension restricted to iPhone only (UIDeviceFamily=1).');
      }

      // Sync CFBundleVersion with main app build number
      const buildNumber = config.ios?.buildNumber;
      if (buildNumber && plist.includes('<key>CFBundleVersion</key>')) {
        plist = plist.replace(
          /<key>CFBundleVersion<\/key>\s*<string>[^<]*<\/string>/,
          `<key>CFBundleVersion</key>\n\t<string>${buildNumber}</string>`
        );
        changed = true;
        console.log(`✅ LiveActivity CFBundleVersion synced to ${buildNumber}.`);
      }

      if (changed) {
        await fs.promises.writeFile(infoPlistPath, plist, 'utf8');
      }

      return config;
    },
  });
}

module.exports = function withLiveActivityAll(config, props) {
  return withPlugins(config, [
    // Register override FIRST
    withSwiftOverride,
    // Then apply expo-live-activity
    ['expo-live-activity', props],
    // Restrict extension to iPhone only (prevents iPad widget picker rejection)
    withLiveActivityiPhoneOnly,
  ]);
};
