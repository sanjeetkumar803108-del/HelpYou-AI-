import React, { useState } from 'react';
import { 
  Search, Sparkles, ArrowLeft, Loader2, Globe, CheckCircle2, 
  Lightbulb, FileText, Check, HelpCircle, GraduationCap, ChevronRight,
  History, X, Trash2, Calendar
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { triggerVibration } from '../utils/vibrate';
import { getProfileContext } from '../utils/profile';
import { safeGetItem } from '../utils/storage';
import { detectAndLogMistake } from '../utils/mistakes';
import { db, auth } from '../lib/firebase';
import { collection, addDoc, serverTimestamp, query as fsQuery, where, orderBy, getDocs, deleteDoc, doc } from 'firebase/firestore';

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
}

const parseSavedSearch = (text: string, title: string): SearchResult => {
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

  const live_updates = "Analysis loaded from your saved deep search session history.";

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
  const [query, setQuery] = useState('');
  const [localNotes, setLocalNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkedSteps, setCheckedSteps] = useState<Record<number, boolean>>({});
  const [showNotesBlending, setShowNotesBlending] = useState(false);

  const [showHistory, setShowHistory] = useState(false);
  const [historyItems, setHistoryItems] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const fetchHistory = async () => {
    if (!auth.currentUser) return;
    setLoadingHistory(true);
    try {
      const q = fsQuery(
        collection(db, 'pocket_items'),
        where('userId', '==', auth.currentUser.uid),
        orderBy('createdAt', 'desc')
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
            createdAt: data.createdAt?.toDate() || new Date()
          });
        }
      });
      setHistoryItems(items);
    } catch (e) {
      console.error("Failed to fetch search history:", e);
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
    if (!query.trim()) return;

    triggerVibration(15);
    setLoading(true);
    setError(null);
    setResult(null);
    setCheckedSteps({});

    try {
      const response = await fetch((import.meta.env.VITE_API_BASE_URL || '') + '/api/live-study-tutor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: query.trim(),
          profileContext: getProfileContext(),
          studentNotes: localNotes.trim() || undefined
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
      setResult(data);
      
      // Auto-detect and log student misconceptions or common traps in live search results
      const searchContext = `${data.topic_title || ''} ${data.pro_tips || ''} ${Array.isArray(data.live_updates) ? data.live_updates.join(' ') : (data.live_updates || '')}`;
      detectAndLogMistake('Live Search', query, searchContext).catch(e => console.error("Live search auto-capture failed:", e));

      // Save deep search session summary to Firebase
      if (auth.currentUser) {
        addDoc(collection(db, 'pocket_items'), {
          userId: auth.currentUser.uid,
          title: `🔍 Deep Search: ${query.trim()}`,
          text: `**Deep Search: ${query.trim()}**\n\n### ${data.topic_title || 'Topic Analysis'}\n\n* **Match Score:** ${data.match_score || 'N/A'}\n* **Pro Tips:** ${data.pro_tips || ''}\n\n#### Action Steps:\n` + 
            (data.action_steps || []).map((step: string, i: number) => `${i + 1}. ${step}`).join('\n') + 
            `\n\n#### Sources:\n` + (data.source_links || []).map((link: string) => `* [${getCleanDomain(link)}](${link})`).join('\n'),
          type: 'deep_search',
          createdAt: serverTimestamp()
        }).catch(err => console.error("Error saving deep search history:", err));
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An unexpected error occurred during search.");
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
            ) : historyItems.length === 0 ? (
              <div className="bg-white border border-zinc-200 rounded-3xl p-8 text-center text-zinc-500 font-bold shadow-sm">
                <p className="text-3xl mb-2">🔍</p>
                <p className="text-sm">No search history found.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {historyItems.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => {
                      triggerVibration(15);
                      setResult(parseSavedSearch(item.text, item.title));
                      setQuery(item.title.replace('🔍 Deep Search:', '').trim());
                      setShowHistory(false);
                    }}
                    className="bg-white border border-zinc-200/80 hover:border-blue-300 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all cursor-pointer flex justify-between items-start group"
                  >
                    <div className="space-y-1.5 flex-1 min-w-0 pr-4">
                      <h4 className="font-black text-zinc-900 group-hover:text-blue-600 transition-colors truncate">
                        {item.title}
                      </h4>
                      <p className="text-[11px] text-zinc-400 font-bold flex items-center gap-1.5">
                        <Calendar className="w-3 h-3 text-zinc-400" />
                        {new Date(item.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                      <div className="text-xs text-zinc-600 line-clamp-2 mt-1.5 font-medium">
                        {item.text ? item.text.substring(0, 120).replace(/[#*`]/g, '') + '...' : ''}
                      </div>
                    </div>
                    <button
                      onClick={(e) => deleteHistoryItem(item.id, e)}
                      className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors active:scale-95"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
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
        {loading && (
          <div className="flex flex-col items-center justify-center py-16 space-y-4">
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
          </div>
        )}

        {/* Error State */}
        {error && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
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
        {result && (
          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* Header Title Card with Match Relevance Badge */}
            <div className="bg-white rounded-3xl p-6 border border-zinc-200/60 shadow-sm space-y-4">
              <div className="flex items-start justify-between gap-4">
                <h3 className="text-lg font-black text-zinc-900 tracking-tight leading-snug">
                  {result.topic_title}
                </h3>
                {result.match_score && (
                  <div className="shrink-0 flex flex-col items-end">
                    <div className="relative flex items-center justify-center">
                      {/* Pulse Ring */}
                      <span className="absolute inset-0 rounded-full bg-emerald-400 opacity-20 animate-ping" />
                      <div className="px-3.5 py-1.5 rounded-full bg-emerald-50 border-2 border-emerald-500 flex items-center gap-1.5 shadow-sm relative z-10">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                        <span className="text-[12px] font-black text-emerald-600 tracking-tight whitespace-nowrap">
                          {result.match_score}
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
                <div className="text-zinc-700 text-xs font-bold leading-relaxed select-text bg-zinc-50/50 p-4 rounded-2xl border border-zinc-150">
                  {Array.isArray(result.live_updates) ? (
                    <ul className="list-disc pl-4 space-y-2">
                      {result.live_updates.map((update, idx) => (
                        <li key={idx} className="whitespace-pre-wrap">{update}</li>
                      ))}
                    </ul>
                  ) : (
                    <div className="whitespace-pre-wrap">{result.live_updates}</div>
                  )}
                </div>
              </div>
            </div>

            {/* Interactive Action Steps Checklist */}
            {result.action_steps && result.action_steps.length > 0 && (
              <div className="bg-white rounded-3xl p-6 border border-zinc-200/60 shadow-sm space-y-4">
                <div className="flex items-center gap-2 text-xs font-black text-purple-600 tracking-wider uppercase">
                  <CheckCircle2 className="w-4.5 h-4.5 text-purple-500 shrink-0" />
                  <span>Actionable Prep Steps</span>
                </div>
                <div className="space-y-2.5">
                  {result.action_steps.map((step, idx) => (
                    <div 
                      key={idx}
                      onClick={() => toggleStep(idx)}
                      className={`flex items-start gap-3 p-3 rounded-2xl border cursor-pointer transition-all ${
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
                      <span className={`text-xs font-bold leading-normal ${checkedSteps[idx] ? 'line-through decoration-emerald-500/50 decoration-2' : ''}`}>
                        {step}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pro Tips Callout Card */}
            {result.pro_tips && (
              <div className="bg-amber-50/60 rounded-3xl p-5 border border-amber-200/50 shadow-sm flex gap-4">
                <div className="w-10 h-10 rounded-2xl bg-amber-500 flex items-center justify-center text-white shrink-0 shadow-sm shadow-amber-500/20">
                  <Lightbulb className="w-5.5 h-5.5 animate-pulse" />
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-amber-700">Pro Prep Tip</span>
                  <p className="text-zinc-800 text-xs font-bold leading-relaxed">
                    {result.pro_tips}
                  </p>
                </div>
              </div>
            )}

            {/* Source Badges and Citations */}
            {result.source_links && result.source_links.length > 0 && (
              <div className="space-y-2.5">
                <div className="text-[10px] font-black text-zinc-400 uppercase tracking-wider px-1">
                  Verified Research Sources
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {result.source_links.map((link, idx) => (
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
        {!result && !loading && (
          <div className="flex flex-col items-center justify-center py-12 text-center space-y-6">
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
          </div>
        )}
        </>
        )}
      </div>
    </div>
  );
}
