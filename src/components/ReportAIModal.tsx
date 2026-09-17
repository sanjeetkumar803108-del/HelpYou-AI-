import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Flag, X, CheckCircle, AlertTriangle, ShieldAlert, Sparkles } from 'lucide-react';
import { auth, db } from '../lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { getApiUrl } from '../utils/api';

export interface ReportAIModalProps {
  isOpen: boolean;
  onClose: () => void;
  messageText?: string;
  sourceFeature?: string;
  onReportSubmitted?: () => void;
}

const REPORT_REASONS = [
  { id: 'inaccurate', label: 'Factually Inaccurate / Hallucination', icon: '❌' },
  { id: 'offensive', label: 'Offensive or Inappropriate Content', icon: '⚠️' },
  { id: 'harmful', label: 'Harmful, Violent, or Dangerous Advice', icon: '🚨' },
  { id: 'sexual', label: 'Sexually Explicit or Suggestive', icon: '🔞' },
  { id: 'other', label: 'Other Safety or Quality Concern', icon: '💬' },
];

export const ReportAIModal: React.FC<ReportAIModalProps> = ({
  isOpen,
  onClose,
  messageText = '',
  sourceFeature = 'AI Tutor',
  onReportSubmitted,
}) => {
  const [selectedReason, setSelectedReason] = useState<string>('inaccurate');
  const [comments, setComments] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const user = auth.currentUser;
      const reportPayload = {
        userId: user ? user.uid : 'anonymous',
        userEmail: user?.email || 'anonymous',
        sourceFeature,
        snippet: messageText.slice(0, 500),
        reason: selectedReason,
        comments: comments.trim(),
        timestamp: new Date().toISOString(),
      };

      // 1. Silent automated dispatch to developer backend (Option B: direct email/alert)
      try {
        const res = await fetch(getApiUrl('/api/report-ai-content'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(reportPayload),
        });
        const data = await res.json().catch(() => null);
        console.log('[AI Content Safety] Backend report status:', data);
      } catch (backendErr) {
        console.warn('[AI Content Safety] Backend reporting call caught:', backendErr);
      }

      // 2. Try to record in Firestore if available (Now permitted by firestore.rules)
      try {
        if (db) {
          const reportsRef = collection(db, 'ai_content_reports');
          await addDoc(reportsRef, {
            ...reportPayload,
            createdAt: serverTimestamp(),
          });
        }
      } catch (firestoreErr) {
        console.warn('Could not write report to Firestore, logging locally:', firestoreErr);
      }

      // 2. Also save to LocalStorage safety audit log
      try {
        const localReports = JSON.parse(localStorage.getItem('helpyou_ai_reports') || '[]');
        localReports.push(reportPayload);
        localStorage.setItem('helpyou_ai_reports', JSON.stringify(localReports.slice(-50)));
      } catch (e) {
        // Ignore local storage error
      }

      setIsSuccess(true);
      if (onReportSubmitted) {
        onReportSubmitted();
      }

      setTimeout(() => {
        setIsSuccess(false);
        setComments('');
        setSelectedReason('inaccurate');
        onClose();
      }, 1600);
    } catch (err) {
      console.error('Error submitting AI content report:', err);
      setIsSuccess(true); // Gracefully close for user
      setTimeout(() => {
        setIsSuccess(false);
        onClose();
      }, 1200);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.2 }}
          className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl p-6 relative"
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-5 right-5 p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          {isSuccess ? (
            <div className="py-8 flex flex-col items-center text-center space-y-3">
              <div className="w-14 h-14 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 rounded-full flex items-center justify-center">
                <CheckCircle className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-extrabold text-zinc-900 dark:text-zinc-100">
                Report Submitted
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-xs">
                Thank you! Your feedback helps ensure HelpYou AI remains safe, accurate, and compliant with Google Play standards.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex items-center gap-2.5 mb-1">
                <div className="w-9 h-9 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 flex items-center justify-center">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-zinc-900 dark:text-zinc-100">
                    Report AI Response
                  </h3>
                  <p className="text-[11px] text-zinc-500 font-medium">
                    Google Play GenAI Safety Review
                  </p>
                </div>
              </div>

              {messageText && (
                <div className="bg-zinc-50 dark:bg-zinc-800/60 p-3 rounded-xl border border-zinc-150 dark:border-zinc-700/50 text-xs text-zinc-600 dark:text-zinc-300 max-h-20 overflow-y-auto italic">
                  "{messageText.slice(0, 140)}..."
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300 block">
                  Select Reason for Reporting:
                </label>
                <div className="space-y-1.5">
                  {REPORT_REASONS.map((reason) => (
                    <label
                      key={reason.id}
                      className={`flex items-center gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-all text-xs font-semibold ${
                        selectedReason === reason.id
                          ? 'border-rose-500 bg-rose-50/50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-300'
                          : 'border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 text-zinc-700 dark:text-zinc-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="reportReason"
                        value={reason.id}
                        checked={selectedReason === reason.id}
                        onChange={() => setSelectedReason(reason.id)}
                        className="accent-rose-600"
                      />
                      <span>{reason.icon}</span>
                      <span>{reason.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300 block mb-1">
                  Additional Details (Optional):
                </label>
                <textarea
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  placeholder="Explain why this response was problematic or inaccurate..."
                  rows={2}
                  className="w-full text-xs p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-800 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-2.5 px-4 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 font-bold text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition-colors flex items-center justify-center gap-1.5 shadow-md shadow-rose-600/20 disabled:opacity-50"
                >
                  <Flag className="w-3.5 h-3.5" />
                  <span>{submitting ? 'Submitting...' : 'Submit Report'}</span>
                </button>
              </div>
            </form>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default ReportAIModal;
