const fs = require('fs');
let content = fs.readFileSync('src/components/NoteMaker.tsx', 'utf8');

content = content.replace(
  '    // Smooth upload progress bar animation\\n    let currentProgress = 0;\\n    const progressInterval = setInterval(() => {\\n      if (currentProgress < 90) {\\n        currentProgress += Math.floor(Math.random() * 8) + 4;\\n        setUploadProgress(Math.min(currentProgress, 90));\\n      }\\n    }, 120);\\n\\n    const formData = new FormData();\\n    formData.append(\\\'action\\\', action);\\n    formData.append(\\\'pdf\\\', file);\\n\\n    try {\\n      const xhr = new XMLHttpRequest();\\n      xhr.open(\\\'POST\\\', \\\'/api/summarize\\\', true);\\n\\n      // Supplement with actual progress if available and ahead\\n      xhr.upload.addEventListener(\\\'progress\\\', (e) => {\\n        if (e.lengthComputable) {\\n          const percentComplete = Math.round((e.loaded / e.total) * 100);\\n          setUploadProgress(prev => Math.max(prev, Math.min(percentComplete, 95)));\\n        }\\n      });\\n\\n      xhr.onload = async () => {\\n        clearInterval(progressInterval);\\n        setUploadProgress(100);',
  '    const formData = new FormData();\\n    formData.append(\\\'action\\\', action);\\n    formData.append(\\\'pdf\\\', file);\\n\\n    try {\\n      const xhr = new XMLHttpRequest();\\n      xhr.open(\\\'POST\\\', \\\'/api/summarize\\\', true);\\n\\n      xhr.upload.addEventListener(\\\'progress\\\', (e) => {\\n        if (e.lengthComputable) {\\n          const percentComplete = Math.round((e.loaded / e.total) * 100);\\n          setUploadProgress(percentComplete);\\n        }\\n      });\\n\\n      xhr.onload = async () => {\\n        setUploadProgress(100);'
);

content = content.replace(
  '            clearInterval(progressInterval);',
  '            // progress updated'
);

fs.writeFileSync('src/components/NoteMaker.tsx', content);
