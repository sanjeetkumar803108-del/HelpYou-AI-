import React, { useState, useEffect } from 'react';
import { 
  Search, Sparkles, ArrowLeft, Loader2, Globe, CheckCircle2, 
  Lightbulb, FileText, Check, HelpCircle, GraduationCap, ChevronRight,
  History, X, Trash2, Calendar, Lock, Download
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { isProUser } from '../utils/coins';
import { triggerVibration } from '../utils/vibrate';
import { getProfileContext } from '../utils/profile';
import { safeGetItem } from '../utils/storage';
import { detectAndLogMistake } from '../utils/mistakes';
import { db, auth } from '../lib/firebase';
import { collection, addDoc, serverTimestamp, query as fsQuery, where, orderBy, getDocs, deleteDoc, doc } from 'firebase/firestore';
import GlobalMarkdown from './GlobalMarkdown';
import { isItemOffline, toggleOfflineItem, getOfflineItems } from '../utils/offlineVault';

interface LiveTutorSearchProps {
  onBack: () => void;
}

interface SearchResult {
  topic_title: string;
  live_updates: string | string[];
  match_score: string;
  action_steps: string[];
  pro_tips: string;
  source_links: string[];
  text?: string;
}

const parseSavedSearch = (text: string, title: string, rawData?: string): SearchResult => {
  if (rawData) {
    try {
      const parsed = JSON.parse(rawData);
      if (parsed && (parsed.topic_title || parsed.live_updates)) {
        return {
          topic_title: parsed.topic_title || title.replace(/🔍|Deep Search:/g, '').trim(),
          live_updates: parsed.live_updates || "Saved search updates loaded from history.",
          match_score: parsed.match_score || '95%',
          action_steps: Array.isArray(parsed.action_steps) ? parsed.action_steps : [],
          pro_tips: parsed.pro_tips || '',
          source_links: Array.isArray(parsed.source_links) ? parsed.source_links : []
        };
      }
    } catch (e) {
      console.error("Error parsing raw_data from history:", e);
    }
  }

  let topic_title = title.replace(/🔍|Deep Search:/g, '').trim();
  const topicMatch = text.match(/### (.*?)\n/);
  if (topicMatch) {
    topic_title = topicMatch[1].trim();
  }

  let match_score = 'N/A';
  const scoreMatch = text.match(/\* \*\*Match Score:\*\* (.*?)\n/);
  if (scoreMatch) {
    match_score = scoreMatch[1].trim();
  }

  let pro_tips = '';
  const tipsMatch = text.match(/\* \*\*Pro Tips:\*\* (.*?)\n/);
  if (tipsMatch) {
    pro_tips = tipsMatch[1].trim();
  }

  let live_updates: string | string[] = [];
  const liveSection = text.match(/#### Verified Live Updates:\n([\s\S]*?)(?=\n\n#### Action Steps:|\n\n#### Sources:|\n\n####|$)/);
  if (liveSection && liveSection[1].trim()) {
    const rawSection = liveSection[1].trim();
    const lines = rawSection.split('\n').map(l => l.replace(/^\*\s*/, '').trim()).filter(Boolean);
    if (lines.length > 0) {
      live_updates = lines;
    } else {
      live_updates = rawSection;
    }
  } else {
    const cleanedText = text
      .replace(/^\*\*Deep Search:.*?\*\*\n*/i, '')
      .replace(/### .*?\n*/g, '')
      .replace(/\* \*\*Match Score:\*\* .*?\n*/g, '')
      .replace(/\* \*\*Pro Tips:\*\* .*?\n*/g, '')
      .replace(/#### Action Steps:[\s\S]*?(?=\n\n####|$)/g, '')
      .replace(/#### Sources:[\s\S]*$/g, '')
      .trim();
    live_updates = cleanedText || "Analysis loaded from your saved deep search session history.";
  }

  const action_steps: string[] = [];
  const actionSection = text.match(/#### Action Steps:\n([\s\S]*?)(?=\n\n#### Sources:|\n\n####|$)/);
  if (actionSection) {
    const lines = actionSection[1].split('\n');
    lines.forEach(line => {
      const cleaned = line.replace(/^\d+\.\s+/, '').trim();
      if (cleaned) {
        action_steps.push(cleaned);
      }
    });
  }

  const source_links: string[] = [];
  const sourcesSection = text.match(/#### Sources:\n([\s\S]*?)$/);
  if (sourcesSection) {
    const lines = sourcesSection[1].split('\n');
    lines.forEach(line => {
      const linkMatch = line.match(/\((https?:\/\/.*?)\)/);
      if (linkMatch) {
        source_links.push(linkMatch[1]);
      }
    });
  }

  return {
    topic_title,
    live_updates,
    match_score,
    action_steps,
    pro_tips,
    source_links
  };
};

export default function LiveTutorSearch({ onBack }: LiveTutorSearchProps) {
  const isVip = isProUser();

  if (!isVip) {
    return (
      <div className="w-full h-full flex flex-col justify-between bg-[#FAF9F6] overflow-hidden min-h-[500px]">
        {/* Navbar */}
        <div className="px-6 py-5 flex items-center justify-between border-b border-zinc-200/40 bg-white">
          <button
            onClick={onBack}
            className="w-10 h-10 rounded-full flex items-center justify-center bg-[#FAF9F6] border border-zinc-200/60 text-zinc-700 hover:text-zinc-950 shadow-sm active:scale-95 transition-all cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="font-extrabold text-zinc-400 text-xs tracking-widest uppercase">Premium Hub</span>
          <div className="w-10 h-10" />
        </div>

        {/* Lock Overlay Content */}
        <div className="flex-1 flex flex-col justify-center items-center p-8 text-center">
          <div className="w-16 h-16 rounded-3xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600 mb-6 relative">
            <Lock className="w-7 h-7" />
            <motion.div
              animate={{ scale: [1, 1.15, 1] }}
              transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
              className="absolute inset-0 rounded-3xl bg-amber-500/5 -z-10"
            />
          </div>
          
          <h2 className="text-2xl font-black text-zinc-900 tracking-tight">
            Deep Search AI is VIP Only! 🌟
          </h2>
          
          <p className="text-sm font-bold text-zinc-500 mt-3 leading-relaxed max-w-sm">
            Deep Search AI is exclusive to our premium VIP users! 🚀
            Please upgrade to our VIP membership to access this feature.
          </p>

          <div className="w-full max-w-xs bg-white border border-zinc-200/80 rounded-[2rem] p-5 my-6 space-y-3 shadow-sm text-left">
            <div className="flex items-center gap-2.5 text-xs font-bold text-zinc-700">
              <span className="text-amber-500 text-lg">✨</span>
              <span>Search Live Dates & Registration Deadlines</span>
            </div>
            <div className="flex items-center gap-2.5 text-xs font-bold text-zinc-700">
              <span className="text-amber-500 text-lg">✨</span>
              <span>Verify Syllabus Changes & High School Facts</span>
            </div>
            <div className="flex items-center gap-2.5 text-xs font-bold text-zinc-700">
              <span className="text-amber-500 text-lg">✨</span>
              <span>Live Web Integration for Real-Time Accuracy</span>
            </div>
          </div>

          <button
            onClick={() => window.dispatchEvent(new CustomEvent('open-vip-modal'))}
            className="w-full max-w-xs py-4 bg-zinc-950 hover:bg-zinc-800 text-white font-black text-sm rounded-2xl shadow-md transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer border-none"
          >
            <Sparkles className="w-4 h-4 text-amber-400 fill-amber-400" />
            Upgrade to VIP PRO
          </button>
        </div>
      </div>
    );
  }

  const [query, setQuery] = useState('');
  const [localNotes, setLocalNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchResponse, setSearchResponse] = useState<SearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkedSteps, setCheckedSteps] = useState<Record<number, boolean>>({});
  const [showNotesBlending, setShowNotesBlending] = useState(false);

  const [showHistory, setShowHistory] = useState(false);
  const [historyItems, setHistoryItems] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [, setOfflineTrigger] = useState(0);

  useEffect(() => {
    const handleOfflineUpdate = () => setOfflineTrigger(prev => prev + 1);
    window.addEventListener('offline-vault-updated', handleOfflineUpdate);
    return () => window.removeEventListener('offline-vault-updated', handleOfflineUpdate);
  }, []);

  const fetchHistory = async () => {
    const offline = getOfflineItems('live_search');
    if (!auth.currentUser) {
      if (offline.length > 0) setHistoryItems(offline);
      return;
    }
    setLoadingHistory(true);
    try {
      const q = fsQuery(
        collection(db, 'pocket_items'),
        where('userId', '==', auth.currentUser.uid)
      );
      const querySnapshot = await getDocs(q);
      const items: any[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        const titleLower = (data.title || '').toLowerCase();
        const textLower = (data.text || '').toLowerCase();
        
        const isSearch = titleLower.includes('deep search') || 
                         textLower.includes('**deep search') ||
                         data.type === 'deep_search';
        if (isSearch) {
          items.push({
            id: doc.id,
            ...data,
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : (data.createdAt || new Date())
          });
        }
      });

      const merged = [...items];
      for (const off of offline) {
        if (!merged.some(m => m.id === off.id)) {
          merged.push(off);
        }
      }

      merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      // Keep only last 20 records
      if (merged.length > 20) {
        const toKeep = merged.slice(0, 20);
        const toDelete = merged.slice(20);
        
        for (const item of toDelete) {
          if (!item.id.startsWith('local_')) {
            try {
              await deleteDoc(doc(db, 'pocket_items', item.id));
            } catch (err) {
              console.error("Failed to delete old search item:", err);
            }
          }
        }
        setHistoryItems(toKeep);
      } else {
        setHistoryItems(merged);
      }
    } catch (e) {
      console.error("Failed to fetch search history:", e);
      if (offline.length > 0) setHistoryItems(offline);
    } finally {
      setLoadingHistory(false);
    }
  };

  const deleteHistoryItem = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    triggerVibration(15);
    try {
      await deleteDoc(doc(db, 'pocket_items', id));
      setHistoryItems(prev => prev.filter(item => item.id !== id));
    } catch (err) {
      console.error("Failed to delete history item:", err);
    }
  };

  const studentGrade = safeGetItem('onboarding_grade') || 'General Student';
  const studentRole = safeGetItem('onboarding_role') || 'Learner';

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // 3. Handle Empty/Null States
    if (!query || !query.trim()) return;

    triggerVibration(15);
    setLoading(true);
    setError(null);
    setSearchResponse(null);
    setCheckedSteps({});

    try {
      // 1. Fix State Synchronization: Capture the latest values directly to prevent stale closure
      const currentQuery = query.trim();
      if (!currentQuery) {
        setLoading(false);
        return;
      }
      const currentNotes = localNotes.trim();

      // 4. Refactor the Fetch Call: proper async/await block
      const response = await fetch((import.meta.env.VITE_API_BASE_URL || '') + '/api/live-study-tutor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: currentQuery,
          profileContext: getProfileContext(),
          studentNotes: currentNotes || undefined
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        if (response.status === 429) {
          throw new Error(errData.text || errData.error || "Tutor is experiencing high traffic. Please try again in 60 seconds.");
        }
        throw new Error(errData.error || "Failed to conduct live search");
      }

      const data = await response.json();

      // Robust result normalization to guarantee clean non-empty SearchResult object
      let formattedResult: SearchResult;
      if (typeof data === 'string') {
        try {
          const parsed = JSON.parse(data);
          formattedResult = {
            topic_title: parsed.topic_title || parsed.title || currentQuery,
            live_updates: parsed.live_updates || parsed.summary || parsed.text || data,
            match_score: parsed.match_score || '95%',
            action_steps: Array.isArray(parsed.action_steps) ? parsed.action_steps : [],
            pro_tips: parsed.pro_tips || '',
            source_links: Array.isArray(parsed.source_links) ? parsed.source_links : [],
            text: data
          };
        } catch {
          formattedResult = {
            topic_title: `Deep Search: ${currentQuery}`,
            live_updates: data,
            match_score: '95%',
            action_steps: [],
            pro_tips: '',
            source_links: [],
            text: data
          };
        }
      } else if (data && typeof data === 'object') {
        const updates = data.live_updates || data.updates || data.content || data.summary || data.text || data.explanation || JSON.stringify(data, null, 2);
        formattedResult = {
          topic_title: data.topic_title || data.title || `Deep Search: ${currentQuery}`,
          live_updates: updates,
          match_score: data.match_score || data.relevance || '95%',
          action_steps: Array.isArray(data.action_steps) ? data.action_steps : (data.steps || []),
          pro_tips: data.pro_tips || data.tip || '',
          source_links: Array.isArray(data.source_links) ? data.source_links : (data.sources || []),
          text: data.text || data.explanation || data.summary || JSON.stringify(data)
         };
      } else {
        formattedResult = {
          topic_title: `Deep Search: ${currentQuery}`,
          live_updates: "Live search response retrieved successfully.",
          match_score: '90%',
          action_steps: [],
          pro_tips: '',
          source_links: [],
          text: String(data)
        };
      }

      // Auto-detect and log student misconceptions or common traps in live search results
      const searchContext = `${formattedResult.topic_title || ''} ${formattedResult.pro_tips || ''} ${Array.isArray(formattedResult.live_updates) ? formattedResult.live_updates.join(' ') : (formattedResult.live_updates || '')}`;
      detectAndLogMistake('Live Search', currentQuery, searchContext).catch(e => console.error("Live search auto-capture failed:", e));

      // Save deep search session summary and raw JSON to Firebase
      if (auth.currentUser) {
        const liveUpdatesText = Array.isArray(formattedResult.live_updates)
          ? formattedResult.live_updates.map((u: string) => `* ${u}`).join('\n')
          : (formattedResult.live_updates || '');

        await addDoc(collection(db, 'pocket_items'), {
          userId: auth.currentUser.uid,
          title: `🔍 Deep Search: ${currentQuery}`,
          text: `**Deep Search: ${currentQuery}**\n\n### ${formattedResult.topic_title || 'Topic Analysis'}\n\n* **Match Score:** ${formattedResult.match_score || 'N/A'}\n* **Pro Tips:** ${formattedResult.pro_tips || ''}\n\n#### Verified Live Updates:\n${liveUpdatesText}\n\n#### Action Steps:\n` + 
            (formattedResult.action_steps || []).map((step: string, i: number) => `${i + 1}. ${step}`).join('\n') + 
            `\n\n#### Sources:\n` + (formattedResult.source_links || []).map((link: string) => `* [${getCleanDomain(link)}](${link})`).join('\n'),
          raw_data: JSON.stringify(formattedResult),
          type: 'deep_search',
          createdAt: serverTimestamp()
        }).catch(err => console.error("Error saving deep search history:", err));
      }

      // 4. Update the UI state ONLY after the parsing is fully complete
      setSearchResponse(formattedResult);
      setError(null);
    } catch (err: any) {
      console.error(err);
      setError("Oops! Something went wrong on our end. Please try again.");
      setSearchResponse(null);
    } finally {
      setLoading(false);
    }
  };

  const toggleStep = (idx: number) => {
    triggerVibration(10);
    setCheckedSteps(prev => ({
      ...prev,
      [idx]: !prev[idx]
    }));
  };

  const getCleanDomain = (url: string) => {
    try {
      const hostname = new URL(url).hostname;
      return hostname.replace('www.', '');
    } catch (e) {
      return url;
    }
  };

  return (
    <div className="flex flex-col h-full bg-white font-sans overflow-hidden">
      {/* Header */}
      <header className="px-5 py-4 border-b border-zinc-200/60 bg-white flex justify-between items-center shrink-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => {
              triggerVibration(15);
              onBack();
            }}
            className="w-9 h-9 rounded-full flex items-center justify-center bg-zinc-100 hover:bg-zinc-200 text-zinc-700 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-base font-black text-zinc-900 flex items-center gap-1.5 leading-tight">
              <span>Deep Search AI</span>
              <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[9px] font-black bg-blue-100 text-blue-700">
                <Globe className="w-2.5 h-2.5 animate-pulse" /> LIVE
              </span>
            </h2>
            <p className="text-[10px] text-zinc-500 font-medium">Google Search Grounding Protocol</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {auth.currentUser && (
            <button
              onClick={() => {
                triggerVibration(15);
                setShowHistory(!showHistory);
                if (!showHistory) fetchHistory();
              }}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                showHistory 
                  ? 'bg-blue-600 text-white shadow-md' 
                  : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700'
              }`}
            >
              <History className="w-4 h-4" />
            </button>
          )}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-50 text-purple-700 border border-purple-100 text-[10px] font-black">
            <GraduationCap className="w-3.5 h-3.5" />
            <span>{studentGrade}</span>
          </div>
        </div>
      </header>

      {/* Main Content Scroll Area */}
      <div className="flex-1 overflow-y-auto px-5 py-6 space-y-6">
        {showHistory ? (
          <div className="max-w-md mx-auto space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-extrabold text-sm text-zinc-500 uppercase tracking-wider">Search History</h3>
            </div>
            
            {loadingHistory ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3 text-zinc-400 font-bold">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                <span>Loading history...</span>
              </div>
            ) : !Array.isArray(historyItems) || historyItems.length === 0 ? (
              <div className="bg-white border border-zinc-200 rounded-3xl p-8 text-center text-zinc-500 font-bold shadow-sm">
                <p className="text-3xl mb-2">🔍</p>
                <p className="text-sm">No search history found.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {(historyItems || []).map((item) => (
                  <div
                    key={item.id}
                    onClick={() => {
                      triggerVibration(15);
                      setSearchResponse(parseSavedSearch(item.text || '', item.title || '', item.raw_data));
                      setQuery((item.title || '').replace('🔍 Deep Search:', '').trim());
                      setShowHistory(false);
                    }}
                    className="bg-white border border-zinc-200/80 hover:border-blue-300 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all cursor-pointer flex justify-between items-start group"
                  >
                    <div className="space-y-1.5 flex-1 min-w-0 pr-4">
                      <h4 className="font-black text-zinc-900 group-hover:text-blue-600 transition-colors truncate">
                        {item.title}
                      </h4>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[11px] text-zinc-400 font-bold flex items-center gap-1.5">
                          <Calendar className="w-3 h-3 text-zinc-400" />
                          {new Date(item.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </p>
                        {isItemOffline('live_search', item.id) && (
                          <span className="text-[8px] font-black px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase tracking-wide flex items-center gap-0.5">
                            <span>💾</span> Offline Ready
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-zinc-600 line-clamp-2 mt-1.5 font-medium">
                        {item.text ? item.text.substring(0, 120).replace(/[#*`]/g, '') + '...' : ''}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleOfflineItem('live_search', item.id, item);
                          setOfflineTrigger(prev => prev + 1);
                        }}
                        className={`p-2 rounded-xl transition-all active:scale-95 cursor-pointer ${
                          isItemOffline('live_search', item.id)
                            ? 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100'
                            : 'text-zinc-400 hover:text-blue-600 hover:bg-blue-50'
                        }`}
                        title={isItemOffline('live_search', item.id) ? "Saved in app offline (Tap to remove)" : "Save inside app for offline access"}
                      >
                        {isItemOffline('live_search', item.id) ? (
                          <CheckCircle2 className="w-4 h-4" />
                        ) : (
                          <Download className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        onClick={(e) => deleteHistoryItem(item.id, e)}
                        className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors active:scale-95 cursor-pointer"
                        title="Delete Search"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Search Form Card */}
            <motion.div 
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-3xl p-5 shadow-sm border border-zinc-200/60"
            >
          <form onSubmit={handleSearch} className="space-y-4">
            <div className="relative">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ask for latest exam dates, syllabus, or live news..."
                className="w-full pl-4 pr-12 py-3.5 bg-zinc-50 border border-zinc-200 rounded-2xl text-sm font-semibold text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-blue-500 transition-all shadow-inner"
              />
              <button
                type="submit"
                disabled={loading || !query.trim()}
                className="absolute right-2 top-2 w-10 h-10 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-100 text-white disabled:text-zinc-400 flex items-center justify-center transition-all cursor-pointer active:scale-95"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
              </button>
            </div>

            {/* Local Context Data Blending Toggle */}
            <div className="pt-1">
              <button
                type="button"
                onClick={() => {
                  triggerVibration(10);
                  setShowNotesBlending(!showNotesBlending);
                }}
                className="text-xs font-bold text-zinc-500 hover:text-blue-600 flex items-center gap-1.5 transition-colors"
              >
                <FileText className="w-4 h-4 text-blue-500" />
                <span>{showNotesBlending ? "Hide local study context" : "Blend local study notes / context"}</span>
                <ChevronRight className={`w-3.5 h-3.5 transition-transform duration-200 ${showNotesBlending ? "rotate-90 text-blue-500" : ""}`} />
              </button>

              <AnimatePresence>
                {showNotesBlending && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden mt-2"
                  >
                    <textarea
                      value={localNotes}
                      onChange={(e) => setLocalNotes(e.target.value)}
                      placeholder="Paste your syllabus, stream, target exams, or specific lecture notes to blend live updates with your local context..."
                      rows={3}
                      className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-2xl text-xs font-semibold text-zinc-800 placeholder-zinc-400/80 focus:outline-none focus:border-blue-500 transition-all leading-relaxed resize-none"
                    />
                    <p className="text-[10px] text-zinc-400 mt-1 font-medium">
                      🧠 The HelpYou AI Tutor will filter live search facts to match exactly what you paste here.
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </form>
        </motion.div>

        {/* Loading State */}
        <AnimatePresence mode="wait">
          {loading && (
            <motion.div 
              key="search-loading"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="flex flex-col items-center justify-center py-16 space-y-4"
            >
              <div className="relative">
                <div className="w-16 h-16 rounded-full border-4 border-blue-500/10 border-t-blue-600 animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Globe className="w-6 h-6 text-blue-500 animate-pulse" />
                </div>
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm font-black text-zinc-800 flex items-center justify-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-purple-500 animate-bounce" /> Searching Live Web Facts
                </p>
                <p className="text-xs font-bold text-zinc-400">Filtering through student profile and blending context...</p>
              </div>
            </motion.div>
          )}

          {/* Error State */}
          {error && !loading && (
            <motion.div 
              key="search-error"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="p-5 rounded-3xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex flex-col gap-2 shadow-sm"
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">⚠️</span>
                <span>Search Interrupted</span>
              </div>
              <p className="text-[11px] leading-relaxed opacity-90">{error}</p>
            </motion.div>
          )}

          {/* Search Results Display */}
          {searchResponse && !loading && (
            <motion.div 
              key={`search-result-${searchResponse.topic_title || 'output'}`}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25 }}
              className="space-y-6"
            >
              {/* Header Title Card with Match Relevance Badge */}
              <div className="bg-white rounded-3xl p-6 border border-zinc-200/60 shadow-sm space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <h3 className="text-lg font-black text-zinc-900 tracking-tight leading-snug">
                    {searchResponse.topic_title}
                  </h3>
                  {searchResponse.match_score && (
                    <div className="shrink-0 flex flex-col items-end">
                      <div className="relative flex items-center justify-center">
                        {/* Pulse Ring */}
                        <span className="absolute inset-0 rounded-full bg-emerald-400 opacity-20 animate-ping" />
                        <div className="px-3.5 py-1.5 rounded-full bg-emerald-50 border-2 border-emerald-500 flex items-center gap-1.5 shadow-sm relative z-10">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                          <span className="text-[12px] font-black text-emerald-600 tracking-tight whitespace-nowrap">
                            {searchResponse.match_score}
                          </span>
                        </div>
                      </div>
                      <span className="text-[9px] font-black text-emerald-600 uppercase mt-1 tracking-wider mr-1">Relevance</span>
                    </div>
                  )}
                </div>

                {/* Live Updates Section */}
                <div className="space-y-3">
                  <div className="flex items-center gap-1.5 text-xs font-black text-blue-600 tracking-wider uppercase">
                    <Globe className="w-4 h-4 shrink-0" />
                    <span>Verified Live Updates</span>
                  </div>
                  <div className="text-zinc-800 text-xs font-bold leading-relaxed select-text bg-zinc-50/50 p-4 rounded-2xl border border-zinc-150">
                    {Array.isArray(searchResponse.live_updates) ? (
                      <div className="space-y-2.5">
                        {searchResponse.live_updates.map((update, idx) => (
                          <div key={idx} className="flex items-start gap-2">
                            <span className="text-blue-600 font-black">•</span>
                            <div className="flex-1 text-zinc-800 font-semibold leading-relaxed">
                              <GlobalMarkdown>{update}</GlobalMarkdown>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-zinc-800 font-semibold leading-relaxed">
                        <GlobalMarkdown>{searchResponse.live_updates}</GlobalMarkdown>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Interactive Action Steps Checklist */}
              {searchResponse.action_steps && searchResponse.action_steps.length > 0 && (
                <div className="bg-white rounded-3xl p-6 border border-zinc-200/60 shadow-sm space-y-4">
                  <div className="flex items-center gap-2 text-xs font-black text-purple-600 tracking-wider uppercase">
                    <CheckCircle2 className="w-4.5 h-4.5 text-purple-500 shrink-0" />
                    <span>Actionable Prep Steps</span>
                  </div>
                  <div className="space-y-2.5">
                    {searchResponse.action_steps.map((step, idx) => (
                      <div 
                        key={idx}
                        onClick={() => toggleStep(idx)}
                        className={`flex items-start gap-3 p-3.5 rounded-2xl border cursor-pointer transition-all ${
                          checkedSteps[idx] 
                            ? 'bg-emerald-50/40 border-emerald-200 text-zinc-500' 
                            : 'bg-zinc-50/50 border-zinc-150 hover:border-zinc-300 text-zinc-800'
                        }`}
                      >
                        <div className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 border transition-all mt-0.5 ${
                          checkedSteps[idx]
                            ? 'bg-emerald-500 border-emerald-500 text-white'
                            : 'border-zinc-300 bg-white'
                        }`}>
                          {checkedSteps[idx] && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                        </div>
                        <div className={`text-xs font-bold leading-normal flex-1 ${checkedSteps[idx] ? 'line-through decoration-emerald-500/50 decoration-2' : ''}`}>
                           <GlobalMarkdown>{step}</GlobalMarkdown>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Pro Tips Callout Card */}
              {searchResponse.pro_tips && (
                <div className="bg-amber-50/60 rounded-3xl p-5 border border-amber-200/50 shadow-sm flex gap-4">
                  <div className="w-10 h-10 rounded-2xl bg-amber-500 flex items-center justify-center text-white shrink-0 shadow-sm shadow-amber-500/20">
                    <Lightbulb className="w-5.5 h-5.5 animate-pulse" />
                  </div>
                  <div className="space-y-1 flex-1">
                    <span className="text-[10px] font-black uppercase tracking-wider text-amber-700">Pro Prep Tip</span>
                    <div className="text-zinc-800 text-xs font-bold leading-relaxed">
                      <GlobalMarkdown>{searchResponse.pro_tips}</GlobalMarkdown>
                    </div>
                  </div>
                </div>
              )}

              {/* Source Badges and Citations */}
              {searchResponse.source_links && searchResponse.source_links.length > 0 && (
                <div className="space-y-2.5">
                  <div className="text-[10px] font-black text-zinc-400 uppercase tracking-wider px-1">
                    Verified Research Sources
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    {searchResponse.source_links.map((link, idx) => (
                      <a
                        key={idx}
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between p-3.5 bg-white hover:bg-zinc-50 rounded-2xl border border-zinc-200/60 shadow-sm transition-all hover:translate-x-1 active:scale-[0.99] group cursor-pointer"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
                            <Globe className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-black text-zinc-900 truncate group-hover:text-blue-600 transition-colors">
                              {getCleanDomain(link)}
                            </p>
                            <p className="text-[10px] text-zinc-400 truncate max-w-[240px]">
                              {link}
                            </p>
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-zinc-400 group-hover:text-zinc-600 transition-colors shrink-0" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* Welcome State when no search conducted yet */}
          {!searchResponse && !loading && !error && (
            <motion.div 
              key="search-welcome"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-col items-center justify-center py-12 text-center space-y-6"
            >
              <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-blue-500 to-indigo-600 flex items-center justify-center text-white text-3xl shadow-md select-none animate-bounce">
                🔍
              </div>
              <div className="space-y-2 max-w-xs">
                <h3 className="text-base font-black text-zinc-900">Deep Search AI</h3>
                <p className="text-xs font-semibold text-zinc-400 leading-relaxed">
                  Enter any query to search the live internet. I will instantly grab dates, exam schedules, and syllabus facts, blending them directly with your onboarding profile!
                </p>
              </div>
              
              {/* Quick Suggestion Pills */}
              <div className="space-y-2.5 w-full">
                <span className="text-[10px] font-black text-zinc-400 uppercase tracking-wider">Popular Live Queries</span>
                <div className="flex flex-wrap justify-center gap-2 px-4">
                  {[
                    "AP Exam dates 2026",
                    "SAT registration deadlines 2026",
                    "Latest JEE / NEET 2026 dates",
                    "NASA latest space discovery",
                    "Top scholarships for High Schoolers 2026"
                  ].map((sug, sIdx) => (
                    <button
                      key={sIdx}
                      onClick={() => {
                        triggerVibration(10);
                        setQuery(sug);
                      }}
                      className="text-[11px] px-3.5 py-2 rounded-xl bg-white hover:bg-zinc-100 text-zinc-700 font-bold border border-zinc-200/60 shadow-sm transition-all hover:scale-105 active:scale-95"
                    >
                      {sug}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        </>
        )}
      </div>
    </div>
  );
}
