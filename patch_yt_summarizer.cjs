const fs = require('fs');
let content = fs.readFileSync('src/components/YouTubeSummarizer.tsx', 'utf8');

const oldCode = `      if (response.ok) {
        setResult(data.text);
      } else {`;

const newCode = `      if (response.ok) {
        setResult(data.text);
        // Auto-save
        if (auth.currentUser) {
          try {
            await addDoc(collection(db, 'pocket_items'), {
              userId: auth.currentUser.uid,
              type: 'note',
              title: 'YouTube Summary',
              text: data.text,
              createdAt: serverTimestamp()
            });
            setSaved(true);
          } catch (e) {
            console.error("Auto-save failed", e);
          }
        }
      } else {`;

content = content.replace(oldCode, newCode);
fs.writeFileSync('src/components/YouTubeSummarizer.tsx', content);
