const fs = require('fs');
let content = fs.readFileSync('src/components/ContentGenerator.tsx', 'utf8');

const oldCode = `      setResult(data.text);
    } catch (err: any) {`;

const newCode = `      setResult(data.text);
      // Auto-save
      if (auth.currentUser) {
        try {
          await addDoc(collection(db, 'pocket_items'), {
            userId: auth.currentUser.uid,
            type: 'note',
            title: \`Generated \${selectedType === 'story' ? 'Story' : selectedType === 'poem' ? 'Poem' : 'Joke'}\`,
            text: data.text,
            createdAt: serverTimestamp()
          });
          setSaved(true);
        } catch (e) {
          console.error("Auto-save failed", e);
        }
      }
    } catch (err: any) {`;

content = content.replace(oldCode, newCode);
fs.writeFileSync('src/components/ContentGenerator.tsx', content);
