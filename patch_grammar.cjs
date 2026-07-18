const fs = require('fs');
let content = fs.readFileSync('src/components/GrammarEnhancer.tsx', 'utf8');

const oldCode = `      if (!response.ok) {
        throw new Error(data.error || 'Failed to enhance text');
      }
      
      setResult(data.text);
    } catch (err: any) {`;

const newCode = `      if (!response.ok) {
        throw new Error(data.error || 'Failed to enhance text');
      }
      
      setResult(data.text);
      // Auto-save
      if (auth.currentUser) {
        try {
          await addDoc(collection(db, 'pocket_items'), {
            userId: auth.currentUser.uid,
            type: 'note',
            title: 'Grammar Enhancement',
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
fs.writeFileSync('src/components/GrammarEnhancer.tsx', content);
