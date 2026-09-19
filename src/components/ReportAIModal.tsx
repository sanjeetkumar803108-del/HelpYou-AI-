import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Flag, X, CheckCircle, ShieldAlert, Mail, Send, ExternalLink, Sparkles, User, AlertTriangle } from 'lucide-react';
import { auth, db } from '../lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { getApiUrl } from '../utils/api';
import { Capacitor } from '@capacitor/core';
import { triggerVibration } from '../utils/vibrate';

export interface ReportAIModalProps {
  isOpen: boolean;
  onClose: () => void;
  messageText?: string;
  sourceFeature?: string;
  onReportSubmitted?: () => void;
}

const DEVELOPER_EMAIL = 'helpyou.ai.support@gmail.com';

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

  const currentReason = REPORT_REASONS.find(r => r.id === selectedReason) || REPORT_REASONS[0];
  const currentUser = auth.currentUser;
  const userEmail = currentUser?.email || 'Not Signed In';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    triggerVibration(20);

    const user = auth.currentUser;
    const resolvedUserEmail = user?.email || 'anonymous';
    const userId = user?.uid || 'anonymous';
    const timestampStr = new Date().toLocaleString();
    const platformStr = Capacitor.isNativePlatform() ? 'Android App' : 'Web Browser';

    // 1. Prepare structured email details
    const emailSubject = `[HelpYou AI Safety Report] ${currentReason.label} - ${sourceFeature}`;
    const emailBody = [
      `Hi HelpYou AI Support & Developer Team,`,
      ``,
      `I am reporting an AI-generated output from HelpYou AI:`,
      ``,
      `================ REPORT DETAILS ================`,
      `• Report Category: ${currentReason.label}`,
      `• Feature / Tool: ${sourceFeature}`,
      `• Reported By (User Email): ${resolvedUserEmail}`,
      `• User ID: ${userId}`,
      `• Timestamp: ${timestampStr}`,
      `• Platform: ${platformStr}`,
      `• Destination Developer: ${DEVELOPER_EMAIL}`,
      `================================================`,
      ``,
      `--- USER COMMENTS / NOTES ---`,
      comments.trim() ? comments.trim() : `(No additional comments provided)`,
      ``,
      `--- REPORTED AI OUTPUT ---`,
      messageText ? messageText.trim() : `(No text provided)`,
      ``,
      `================================================`,
      `Please review this output for Google Play GenAI safety and quality guidelines.`
    ].join('\n');

    // 2. Build mailto URL with complete prefilled fields
    const mailtoUrl = `mailto:${DEVELOPER_EMAIL}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;

    // 3. Open user's email client (Gmail / Default Mail)
    try {
      window.location.href = mailtoUrl;
    } catch (openErr) {
      console.warn('window.location.href mailto failed, falling back to window.open:', openErr);
      window.open(mailtoUrl, '_system');
    }

    // 4. Concurrently log report to backend and Firestore for developer audit safety
    try {
      const reportPayload = {
        userId,
        userEmail: resolvedUserEmail,
        developerEmail: DEVELOPER_EMAIL,
        sourceFeature,
        snippet: messageText.slice(0, 1000),
        reason: selectedReason,
        reasonLabel: currentReason.label,
        comments: comments.trim(),
        timestamp: new Date().toISOString(),
      };

      // Backend dispatch
      fetch(getApiUrl('/api/report-ai-content'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reportPayload),
      }).catch(err => console.warn('[ReportAIModal] Backend reporting call warning:', err));

      // Firestore audit record
      if (db) {
        const reportsRef = collection(db, 'ai_content_reports');
        addDoc(reportsRef, {
          ...reportPayload,
          createdAt: serverTimestamp(),
        }).catch(err => console.warn('[ReportAIModal] Firestore report warning:', err));
      }

      // Local storage fallback
      const localReports = JSON.parse(localStorage.getItem('helpyou_ai_reports') || '[]');
      localReports.push(reportPayload);
      localStorage.setItem('helpyou_ai_reports', JSON.stringify(localReports.slice(-50)));
    } catch (bgErr) {
      console.warn('[ReportAIModal] Background logging caught:', bgErr);
    }

    setIsSuccess(true);
    if (onReportSubmitted) {
      onReportSubmitted();
    }

    setTimeout(() => {
      setIsSuccess(false);
      setComments('');
      setSelectedReason('inaccurate');
      setSubmitting(false);
      onClose();
    }, 2400);
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.2 }}
          className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl p-6 relative max-h-[92vh] flex flex-col"
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
                Email App Opened!
              </h3>
              <p className="text-xs text-zinc-600 dark:text-zinc-300 max-w-xs leading-relaxed">
                All report details, recipient email, report type, and AI output have been prefilled into your email composer. 
              </p>
              <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 px-3.5 py-2 rounded-xl text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                👉 Please tap "Send" in your email client to complete submission.
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4 overflow-y-auto pr-1">
              <div className="flex items-center gap-2.5 mb-1">
                <div className="w-9 h-9 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 flex items-center justify-center shrink-0">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-zinc-900 dark:text-zinc-100">
                    Report AI Output
                  </h3>
                  <p className="text-[11px] text-zinc-500 font-medium">
                    Google Play GenAI Safety Review ({sourceFeature})
                  </p>
                </div>
              </div>

              {/* Reported Snippet Preview */}
              {messageText && (
                <div className="bg-zinc-50 dark:bg-zinc-800/60 p-3 rounded-xl border border-zinc-200 dark:border-zinc-700/50 text-xs text-zinc-600 dark:text-zinc-300 max-h-24 overflow-y-auto italic">
                  "{messageText.slice(0, 180)}{messageText.length > 180 ? '...' : ''}"
                </div>
              )}

              {/* Prefilled Email Notice */}
              <div className="bg-blue-50/70 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/40 rounded-xl p-2.5 text-[11px] text-blue-800 dark:text-blue-300 space-y-1">
                <div className="flex items-center gap-1.5 font-bold">
                  <Mail className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span>Auto-Prefilled Email Destination:</span>
                </div>
                <div className="pl-5 text-[10.5px] text-blue-700 dark:text-blue-400 space-y-0.5">
                  <div><strong>To:</strong> {DEVELOPER_EMAIL}</div>
                  <div><strong>From:</strong> {userEmail}</div>
                </div>
              </div>

              {/* Reason Selector */}
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

              {/* Optional comments */}
              <div>
                <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300 block mb-1">
                  Additional Details (Optional):
                </label>
                <textarea
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  placeholder="Explain why this output was inaccurate or inappropriate..."
                  rows={2}
                  className="w-full text-xs p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-800 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 resize-none"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-3 px-4 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 font-bold text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-3 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition-colors flex items-center justify-center gap-1.5 shadow-md shadow-rose-600/20 disabled:opacity-50 active:scale-95 cursor-pointer"
                >
                  <Mail className="w-4 h-4" />
                  <span>{submitting ? 'Opening Email...' : 'Send via Email'}</span>
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
