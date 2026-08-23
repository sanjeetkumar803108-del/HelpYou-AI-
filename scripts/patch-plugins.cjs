const fs = require('fs');
const path = require('path');

const pluginBuildGradles = [
  path.join(__dirname, '..', 'node_modules', '@capacitor-firebase', 'authentication', 'android', 'build.gradle'),
  path.join(__dirname, '..', 'node_modules', '@capacitor-firebase', 'analytics', 'android', 'build.gradle'),
  path.join(__dirname, '..', 'node_modules', '@capacitor-firebase', 'crashlytics', 'android', 'build.gradle')
];

pluginBuildGradles.forEach((filePath) => {
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Remove the conflicting buildscript block with AGP 8.13.0
    content = content.replace(/buildscript\s*\{[\s\S]*?dependencies\s*\{[\s\S]*?classpath\s+['"]com\.android\.tools\.build:gradle:[^'"]+['"][\s\S]*?\}\s*\}/g, '');
    
    // Replace Java 21 with Java 17 for perfect LTS compatibility
    content = content.replace(/JavaVersion\.VERSION_21/g, 'JavaVersion.VERSION_17');

    fs.writeFileSync(filePath, content, 'utf8');
    console.log('[Patch Plugin] Patched:', filePath);
  }
});
