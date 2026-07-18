const fs = require('fs');
let content = fs.readFileSync('src/components/NoteMaker.tsx', 'utf8');

const oldCode = `      if (response.ok) {
        setResult(data.text);
        
        if (action === 'audio') {
          try {
            const ttsResponse = await fetch('/api/tts', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: data.text }),
            });
            const ttsData = await ttsResponse.json();
            if (ttsResponse.ok && ttsData.audio) {
              setAudioData(\`data:audio/wav;base64,\${ttsData.audio}\`);
            }
          } catch (ttsErr) {
            console.error("Failed to fetch audio", ttsErr);
          }
        }
        setStep('result');
      } else {`;

const newCode = `      if (response.ok) {
        setResult(data.text);
        
        let fetchedAudio = null;
        if (action === 'audio') {
          try {
            const ttsResponse = await fetch('/api/tts', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: data.text }),
            });
            const ttsData = await ttsResponse.json();
            if (ttsResponse.ok && ttsData.audio) {
              fetchedAudio = \`data:audio/wav;\${ttsData.audio}\`; // Fixed audio format
              if (ttsData.audio.startsWith('data:')) {
                 fetchedAudio = ttsData.audio;
              } else {
                 fetchedAudio = \`data:audio/wav;base64,\${ttsData.audio}\`;
              }
              setAudioData(fetchedAudio);
            }
          } catch (ttsErr) {
            console.error("Failed to fetch audio", ttsErr);
          }
        }
        setStep('result');
        
        // Auto-save
        if (auth.currentUser) {
          try {
            await addDoc(collection(db, 'pocket_items'), {
              userId: auth.currentUser.uid,
              type: 'note',
              text: data.text,
              audioData: fetchedAudio,
              title: file?.name || 'Document Note',
              createdAt: serverTimestamp()
            });
            setSaved(true);
          } catch (e) {
            console.error("Auto-save failed", e);
          }
        }
      } else {`;

content = content.replace(oldCode, newCode);
fs.writeFileSync('src/components/NoteMaker.tsx', content);
