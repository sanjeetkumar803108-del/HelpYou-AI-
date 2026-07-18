const fs = require('fs');
let content = fs.readFileSync('src/components/PocketTeacher.tsx', 'utf8');

// Add idb-keyval import
content = content.replace("import { db, auth } from '../lib/firebase';", "import { db, auth } from '../lib/firebase';\nimport { get, set, del } from 'idb-keyval';");

// Update handleDownload to actually fetch and save audio
const handleDownloadRegex = /const handleDownload = \(id: string\) => \{[\s\S]*?\};/;
const newHandleDownload = `const handleDownload = async (item: SavedItem) => {
    if (!isVip) {
      alert("VIP required to download audio for offline use.");
      return;
    }
    
    if (downloadedAudios[item.id]) {
      alert("Audio is already saved to your Offline Bag!");
      return;
    }

    try {
      setLoadingAudio(item.id);
      
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: item.text, voice: 'en-US-Journey-F' }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate audio');
      }

      const data = await response.json();
      
      if (data.audioContent) {
        await set(\`audio_\${item.id}\`, data.audioContent);
        setDownloadedAudios(prev => ({...prev, [item.id]: "downloaded"}));
        alert("Audio saved to your Offline Bag!");
      }
    } catch (error) {
      console.error("Download error:", error);
      alert("Failed to download audio for offline use.");
    } finally {
      setLoadingAudio(null);
    }
  };`;
content = content.replace(handleDownloadRegex, newHandleDownload);

// Update useEffect to check for downloaded audios on mount
const useEffectRegex = /useEffect\(\(\) => \{\n\s*return \(\) => \{\n\s*stopAudio\(\);\n\s*\};\n\s*\}, \[\]\);/;
const newUseEffect = `useEffect(() => {
    // Check IndexedDB for existing offline audios
    const checkOfflineAudios = async () => {
      const keys = await import('idb-keyval').then(m => m.keys());
      const downloaded: Record<string, string> = {};
      for (const key of keys) {
        if (typeof key === 'string' && key.startsWith('audio_')) {
          const id = key.replace('audio_', '');
          downloaded[id] = "downloaded";
        }
      }
      setDownloadedAudios(downloaded);
    };
    checkOfflineAudios();

    return () => {
      stopAudio();
    };
  }, []);`;
content = content.replace(useEffectRegex, newUseEffect);

// Update playTTS to use offline audio if available
const playTTSRegex = /const playTTS = async \(id: string, text: string, existingAudioBase64\?: string\) => \{[\s\S]*?if \(!response\.ok\) \{/;
const newPlayTTS = `const playTTS = async (id: string, text: string, existingAudioBase64?: string) => {
    if (!isVip) return;
    
    if (window.speechSynthesis) {
      const silent = new SpeechSynthesisUtterance('');
      silent.volume = 0;
      window.speechSynthesis.speak(silent);
    }
    
    if (playingIndex === id) {
      stopAudio();
      return;
    }
    
    stopAudio();
    initAudio();
    
    try {
      setLoadingAudio(id);
      
      let audioContent = existingAudioBase64;

      if (!audioContent) {
        // Check if available offline in IndexedDB
        const offlineAudio = await get(\`audio_\${id}\`);
        if (offlineAudio) {
          audioContent = offlineAudio as string;
        }
      }

      if (!audioContent) {
        const response = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, voice: 'en-US-Journey-F' }),
        });
        
        if (!response.ok) {`;
content = content.replace(playTTSRegex, newPlayTTS);

// Update delete functionality to also remove from IndexedDB
const handleDeleteRegex = /const handleDelete = async \(id: string\) => \{[\s\S]*?await deleteDoc\(doc\(db, 'savedItems', id\)\);[\s\S]*?\};/;
const newHandleDelete = `const handleDelete = async (id: string) => {
    if (!auth.currentUser) return;
    try {
      await deleteDoc(doc(db, 'savedItems', id));
      await del(\`audio_\${id}\`); // Remove from offline storage
      setDownloadedAudios(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      if (playingIndex === id) {
        stopAudio();
      }
      if (selectedItem?.id === id) {
        setSelectedItem(null);
      }
    } catch (error) {
      console.error('Error deleting item:', error);
    }
  };`;
content = content.replace(handleDeleteRegex, newHandleDelete);

fs.writeFileSync('src/components/PocketTeacher.tsx', content);
