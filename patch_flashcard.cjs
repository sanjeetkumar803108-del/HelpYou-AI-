const fs = require('fs');

let content = fs.readFileSync('src/components/FlashcardGenerator.tsx', 'utf8');

const oldCode = `      if (response.ok && data.flashcards) {
        setFlashcards(data.flashcards);
      } else {`;

const newCode = `      if (response.ok && data.flashcards) {
        setFlashcards(data.flashcards);
        // Auto-save
        if (auth.currentUser) {
          try {
            const textContent = data.flashcards.map((f, i) => \`**Q\${i+1}**: \${f.question}\\n**A\${i+1}**: \${f.answer}\`).join('\\n\\n');
            await addDoc(collection(db, 'pocket_items'), {
              userId: auth.currentUser.uid,
              type: 'note', 
              text: \`**Flashcards Study Set**\\n\\n\${textContent}\`,
              title: 'Flashcards',
              createdAt: serverTimestamp()
            });
            setSaved(true);
          } catch (e) {
            console.error("Auto-save failed", e);
          }
        }
      } else {`;

content = content.replace(oldCode, newCode);
fs.writeFileSync('src/components/FlashcardGenerator.tsx', content);
