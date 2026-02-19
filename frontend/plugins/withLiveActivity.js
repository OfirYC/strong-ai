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

module.exports = function withLiveActivityAll(config, props) {
  return withPlugins(config, [
    // Register override FIRST
    withSwiftOverride,
    // Then apply expo-live-activity
    ['expo-live-activity', props],
  ]);
};
