const fs = require('fs');
let content = fs.readFileSync('src/components/NoteMaker.tsx', 'utf8');

// Replace the fake progress section with just simple setup
content = content.replace(
  '    // Smooth upload progress bar animation\n    let currentProgress = 0;\n    const progressInterval = setInterval(() => {\n      if (currentProgress < 90) {\n        currentProgress += Math.floor(Math.random() * 8) + 4;\n        setUploadProgress(Math.min(currentProgress, 90));\n      }\n    }, 120);\n\n    const formData = new FormData();',
  '    const formData = new FormData();'
);

// Replace the event listener inside
content = content.replace(
  '      xhr.upload.addEventListener(\'progress\', (e) => {\n        if (e.lengthComputable) {\n          const percentComplete = Math.round((e.loaded / e.total) * 100);\n          setUploadProgress(prev => Math.max(prev, Math.min(percentComplete, 95)));\n        }\n      });',
  '      xhr.upload.addEventListener(\'progress\', (e) => {\n        if (e.lengthComputable) {\n          const percentComplete = Math.round((e.loaded / e.total) * 100);\n          setUploadProgress(percentComplete);\n        }\n      });'
);

// Replace the interval clearing
content = content.replace(
  /clearInterval\(progressInterval\);/g,
  '// progress cleared'
);

fs.writeFileSync('src/components/NoteMaker.tsx', content);
