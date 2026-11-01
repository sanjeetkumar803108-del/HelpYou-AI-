import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Flag, 
  AlertTriangle, 
  CheckCircle2, 
  X, 
  Send, 
  ShieldAlert, 
  FileText, 
  ChevronDown, 
  ChevronUp, 
  Mail, 
  ExternalLink, 
  Copy, 
  Check 
} from 'lucide-react';
import { getApiUrl } from '../utils/api';
import { auth, db } from '../lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { Capacitor } from '@capacitor/core';
import { showToast } from '../utils/toast';

export interface ReportAiModalProps {
  isOpen: boolean;
  onClose: () => void;
  aiOutput?: string;
  messageText?: string;
  sourceFeature?: string;
  context?: string; // e.g. "AI Tutor Chat", "FRQ Grader", "AP Trap Radar", "AP Notes", "Test Prep"
  questionText?: string;
  promptText?: string;
}

export const DEVELOPER_EMAIL = 'aiapexam@gmail.com';

const REPORT_REASONS = [
  { id: 'inaccurate', label: 'Inaccurate or Incorrect Math / Facts', icon: '❌', desc: 'Wrong calculation, false historical fact, or erroneous concept' },
  { id: 'abusive', label: 'Offensive, Toxic, or Abusive Content', icon: '⚠️', desc: 'Inappropriate language, derogatory tone, or offensive generation' },
  { id: 'harmful', label: 'Harmful, Dangerous, or Unsafe Advice', icon: '🚨', desc: 'Violates safety guidelines or promotes harmful behavior' },
  { id: 'hallucinated', label: 'Hallucinated or Fabricated AP Info', icon: '🌀', desc: 'Made-up rubric criteria, non-existent formulas, or invalid AP units' },
  { id: 'other', label: 'Other Issue or Buggy Output', icon: '💬', desc: 'Unformatted markdown, repetitive loop, or confusing output' }
];

export const ReportAiModal: React.FC<ReportAiModalProps> = ({
  isOpen = false,
  onClose,
  aiOutput,
  messageText,
  sourceFeature,
  context,
  questionText,
  promptText
}) => {
  const currentUser = auth?.currentUser;
  const [selectedReason, setSelectedReason] = useState<string>('inaccurate');
  const [details, setDetails] = useState<string>('');
  const [studentEmail, setStudentEmail] = useState<string>(currentUser?.email || '');
  const [showSnippet, setShowSnippet] = useState<boolean>(false);
  const [copiedBody, setCopiedBody] = useState<boolean>(false);
  const [isOpeningEmail, setIsOpeningEmail] = useState<boolean>(false);

  // Normalize props safely so undefined/missing props never crash
  const rawOutput = (aiOutput !== undefined && aiOutput !== null) ? aiOutput : (messageText !== undefined && messageText !== null ? messageText : '');
  const safeOutput = typeof rawOutput === 'string' ? rawOutput : (rawOutput ? String(rawOutput) : '');
  const activeContext = (context || sourceFeature || 'HelpYou AI Feature').trim();
  const rawQuestion = (questionText !== undefined && questionText !== null) ? questionText : (promptText !== undefined && promptText !== null ? promptText : '');
  const safeQuestion = typeof rawQuestion === 'string' ? rawQuestion : (rawQuestion ? String(rawQuestion) : '');

  // Handle Android hardware back button
  useEffect(() => {
    if (!isOpen) return;

    const handleBackButton = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    window.addEventListener('appBackButton', handleBackButton);

    return () => {
      window.removeEventListener('appBackButton', handleBackButton);
    };
  }, [isOpen, onClose]);

  const reasonObj = REPORT_REASONS.find(r => r.id === selectedReason) || REPORT_REASONS[0];
  const reasonLabel = reasonObj.label;

  // Memoized pre-filled email subject and body to eliminate main-thread freeze
  const { emailSubject, emailBody } = useMemo(() => {
    const reason = REPORT_REASONS.find(r => r.id === selectedReason) || REPORT_REASONS[0];
    const userMail = studentEmail || currentUser?.email || 'student@helpyou-ai.app';
    const subject = `[HelpYou AI Report] ${reason.label} (${activeContext})`;

    // Prevent OS mailto length limitation overflows by capping snippet if extremely long
    const maxMailtoLen = 1400;
    const reportedSnippet = (safeOutput && typeof safeOutput === 'string' && safeOutput.length > maxMailtoLen)
      ? `${safeOutput.slice(0, maxMailtoLen)}\n\n... [Full response safely archived in developer database vault]`
      : (safeOutput || '');

    const body = [
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `🚨 HELPYOU AI APP - AI CONTENT REPORT`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `• Developer Recipient: ${DEVELOPER_EMAIL}`,
      `• Sender / Student Email: ${userMail}`,
      `• Student User ID: ${currentUser?.uid || 'guest_user'}`,
      `• Report Category: ${reason.label}`,
      `• App Screen / Feature: ${activeContext}`,
      `• Date & Time: ${new Date().toLocaleString()}`,
      ``,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `🤖 REPORTED AI OUTPUT:`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      safeQuestion ? `[Question / Context Prompt]:\n${safeQuestion}\n\n` : '',
      reportedSnippet,
      ``,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `💬 STUDENT NOTES / EXPLANATION:`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      details.trim() || 'Please review the reported AI output above for factual, abusive, or rubric inaccuracies.',
      ``,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `📱 SYSTEM DETAILS:`,
      `• Application: HelpYou AI (Android / Web)`,
      `• Platform: ${Capacitor.isNativePlatform() ? 'Android Native App' : 'Web Browser'}`,
      `• Timestamp: ${new Date().toISOString()}`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
    ].join('\n');

    return { emailSubject: subject, emailBody: body };
  }, [selectedReason, studentEmail, currentUser, activeContext, safeOutput, safeQuestion, details]);

  // Compute encoded mailto and gmail URLs strictly on-demand
  const getMailtoUrl = (reasonId = selectedReason) => {
    const reason = REPORT_REASONS.find(r => r.id === reasonId) || REPORT_REASONS[0];
    const subject = `[HelpYou AI Report] ${reason.label} (${activeContext})`;
    return `mailto:${DEVELOPER_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailBody)}`;
  };

  const getGmailUrl = (reasonId = selectedReason) => {
    const reason = REPORT_REASONS.find(r => r.id === reasonId) || REPORT_REASONS[0];
    const subject = `[HelpYou AI Report] ${reason.label} (${activeContext})`;
    return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(DEVELOPER_EMAIL)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailBody)}`;
  };

  // Background logging so developer never loses a report even if user closes email app
  const logReportSilently = async (reasonId = selectedReason) => {
    try {
      const reason = REPORT_REASONS.find(r => r.id === reasonId) || REPORT_REASONS[0];
      const payload = {
        reason: reason.label,
        details: (details || '').trim(),
        aiOutput: safeOutput.trim(),
        context: activeContext.trim(),
        questionText: safeQuestion.trim(),
        userEmail: (studentEmail || currentUser?.email || 'student@helpyou-ai.app').trim(),
        userId: currentUser?.uid || 'guest_user',
        timestamp: new Date().toISOString()
      };

      fetch(getApiUrl('/api/report-ai-content'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).catch(() => {});

      if (db) {
        addDoc(collection(db, 'ai_content_reports'), {
          ...payload,
          createdAt: serverTimestamp(),
          status: 'pending_review',
          notifiedDeveloper: DEVELOPER_EMAIL
        }).catch(() => {});
      }
    } catch (_) {}
  };

  // Launch Default Email App with all fields pre-filled
  const handleOpenDefaultEmail = (reasonId = selectedReason, e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsOpeningEmail(true);
    logReportSilently(reasonId);

    const mailtoUrl = getMailtoUrl(reasonId);

    // Bulletproof native/web mailto launcher
    try {
      const mailLink = document.createElement('a');
      mailLink.href = mailtoUrl;
      mailLink.setAttribute('target', '_system');
      mailLink.setAttribute('rel', 'noopener noreferrer');
      document.body.appendChild(mailLink);
      mailLink.click();
      document.body.removeChild(mailLink);
    } catch (_) {
      window.location.href = mailtoUrl;
    }

    showToast('📧 Opening email app with pre-filled report. Tap Send!');

    setTimeout(() => {
      setIsOpeningEmail(false);
      onClose();
    }, 1200);
  };

  // Open Directly in Gmail Web (great for browser students who use Gmail)
  const handleOpenGmailWeb = (reasonId = selectedReason) => {
    logReportSilently(reasonId);
    const gmailUrl = getGmailUrl(reasonId);
    window.open(gmailUrl, '_blank', 'noopener,noreferrer');
    showToast('🚀 Opening Gmail with pre-filled report. Tap Send!');
    setTimeout(() => {
      onClose();
    }, 1200);
  };

  // Copy details to clipboard
  const handleCopyBody = async () => {
    try {
      await navigator.clipboard.writeText(`To: ${DEVELOPER_EMAIL}\nSubject: ${emailSubject}\n\n${emailBody}`);
      setCopiedBody(true);
      showToast('📋 Pre-filled email copied to clipboard!');
      setTimeout(() => setCopiedBody(false), 2000);
    } catch (_) {}
  };

  const modalContent = (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="report-ai-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="fixed inset-0 z-[99999] flex flex-col justify-end sm:justify-center items-center p-0 sm:p-4 bg-black/60 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]"
          onClick={onClose}
          style={{ willChange: 'opacity', transform: 'translateZ(0)' }}
        >
          <motion.div
            key="report-ai-sheet"
            initial={{ opacity: 0, y: 36, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 28, scale: 0.98 }}
            transition={{ type: 'spring', damping: 28, stiffness: 350 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white text-zinc-900 border border-zinc-200 rounded-t-3xl sm:rounded-3xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl overflow-hidden relative font-sans"
            style={{ willChange: 'transform, opacity', transform: 'translateZ(0)' }}
          >
            {/* Top Accent Gradient Bar */}
            <div className="h-1.5 w-full bg-gradient-to-r from-red-500 via-amber-500 to-rose-600 shrink-0" />

        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-zinc-200 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center border border-red-200 shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-zinc-950 tracking-tight">Report Content</h3>
                <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded-full bg-red-100 text-red-800 border border-red-200">
                  Pre-filled
                </span>
              </div>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                Recipient: <strong className="text-red-600 font-semibold">{DEVELOPER_EMAIL}</strong>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-600 hover:text-zinc-900 transition-all cursor-pointer active:scale-95"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body (Scrollable) */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1 overscroll-contain bg-white">
          {/* Source Feature Banner */}
          <div className="flex items-center justify-between text-xs px-3.5 py-2.5 rounded-2xl bg-zinc-50 border border-zinc-200 text-zinc-800">
            <span className="text-zinc-500 font-semibold">Reporting From:</span>
            <span className="font-bold text-amber-800">📍 {activeContext}</span>
          </div>

          {/* Reason Selector */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-zinc-900 block">
                1. Select Problem Type <span className="text-red-500">*</span>
              </label>
              <span className="text-[10px] text-zinc-500 font-medium">Tap to select</span>
            </div>

            <div className="space-y-2">
              {REPORT_REASONS.map((r) => {
                const isSelected = selectedReason === r.id;
                return (
                  <div
                    key={r.id}
                    onClick={() => setSelectedReason(r.id)}
                    className={`w-full p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                      isSelected
                        ? 'bg-red-50/80 border-2 border-red-500 text-zinc-950 shadow-xs ring-2 ring-red-500/10'
                        : 'bg-zinc-50/80 border-zinc-200 text-zinc-800 hover:bg-zinc-100 hover:border-zinc-300'
                    }`}
                  >
                    <div className="flex items-start gap-2.5 min-w-0 flex-1">
                      <span className="text-lg shrink-0 select-none mt-0.5">{r.icon}</span>
                      <div className="min-w-0">
                        <p className={`text-xs font-bold leading-tight ${isSelected ? 'text-red-950 font-black' : 'text-zinc-900'}`}>
                          {r.label}
                        </p>
                        <p className={`text-[11px] mt-0.5 leading-snug ${isSelected ? 'text-red-800 font-medium' : 'text-zinc-600'}`}>
                          {r.desc}
                        </p>
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-1.5">
                      {isSelected && (
                        <span className="w-5 h-5 rounded-full bg-red-600 text-white flex items-center justify-center text-[10px] font-bold shadow-xs">
                          ✓
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Additional Explanation (Optional) */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-zinc-900 block">
              2. Extra Notes <span className="text-zinc-500 font-normal">(Optional)</span>
            </label>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Add any extra detail for the developer (optional)..."
              rows={2}
              className="w-full px-3 py-2.5 rounded-xl bg-zinc-50 border border-zinc-200 text-xs text-zinc-900 placeholder-zinc-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 resize-none transition-colors"
            />
          </div>

          {/* Student Email (Pre-filled) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-zinc-900 block">
                3. Sender / Student Email
              </label>
              <span className="text-[10px] text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full font-semibold">Pre-filled</span>
            </div>
            <input
              type="email"
              value={studentEmail}
              onChange={(e) => setStudentEmail(e.target.value)}
              placeholder="student@example.com"
              className="w-full px-3 py-2.5 rounded-xl bg-zinc-50 border border-zinc-200 text-xs text-zinc-900 placeholder-zinc-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-colors"
            />
          </div>

          {/* Collapsible Preview of Pre-filled AI Output */}
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowSnippet(!showSnippet)}
              className="w-full px-3.5 py-2.5 flex items-center justify-between text-xs font-semibold text-zinc-800 hover:text-zinc-950 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2 truncate">
                <FileText className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                <span className="truncate">Preview Email Template</span>
              </div>
              {showSnippet ? <ChevronUp className="w-3.5 h-3.5 text-zinc-500" /> : <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />}
            </button>

            {showSnippet && (
              <div className="p-3 border-t border-zinc-200 text-[11px] text-zinc-800 max-h-48 overflow-y-auto whitespace-pre-wrap leading-relaxed font-mono bg-zinc-100">
                <div className="text-red-700 font-bold mb-1">To: {DEVELOPER_EMAIL}</div>
                <div className="text-sky-800 font-semibold mb-1">From: {studentEmail || currentUser?.email || 'student@ap-exam.app'}</div>
                <div className="text-amber-900 font-semibold mb-2">Subject: {emailSubject}</div>
                <div>{emailBody}</div>
              </div>
            )}
          </div>

          {/* Information Callout */}
          <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-950 text-xs flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <p className="leading-snug text-[11px] text-emerald-900 font-medium">
              Tapping <strong>"Open Email App"</strong> below will open your email composer with <strong>recipient, subject, your email, and reported notes context already 100% pre-filled</strong>. Just tap <strong>Send</strong>!
            </p>
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="p-4 border-t border-zinc-200 bg-white flex flex-col gap-2.5 shrink-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {/* Primary Action: Open Default Email App */}
            <button
              type="button"
              onClick={() => handleOpenDefaultEmail(selectedReason)}
              disabled={isOpeningEmail}
              className="w-full py-3 px-4 rounded-xl text-xs font-black !text-white bg-gradient-to-r from-red-600 via-rose-600 to-red-600 hover:opacity-95 active:scale-98 transition-all shadow-md shadow-red-500/20 cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Mail className="w-4 h-4 text-white" />
              <span className="!text-white font-black">Open Email App</span>
            </button>

            {/* Secondary Action: Open Gmail Web */}
            <button
              type="button"
              onClick={() => handleOpenGmailWeb(selectedReason)}
              className="w-full py-3 px-4 rounded-xl text-xs font-bold text-zinc-900 bg-zinc-100 hover:bg-zinc-200 border border-zinc-300 active:scale-98 transition-all cursor-pointer flex items-center justify-center gap-2 shadow-2xs"
            >
              <ExternalLink className="w-4 h-4 text-red-600" />
              <span>Open in Gmail (Web)</span>
            </button>
          </div>

          {/* Tertiary Action: Copy Everything */}
          <div className="flex items-center justify-between pt-1 text-[11px] text-zinc-600 px-1">
            <button
              type="button"
              onClick={handleCopyBody}
              className="inline-flex items-center gap-1.5 hover:text-zinc-950 transition-colors cursor-pointer font-medium"
            >
              {copiedBody ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedBody ? 'Copied to clipboard!' : 'Copy full email text'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="hover:text-zinc-950 transition-colors cursor-pointer font-bold px-2 py-1 rounded-lg hover:bg-zinc-100"
            >
              Cancel
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
      )}
    </AnimatePresence>
  );

  if (typeof document !== 'undefined') {
    return createPortal(modalContent, document.body);
  }

  return modalContent;
};

/**
 * Reusable compact button to report any AI output across the app
 */
export const ReportAiButton: React.FC<{
  aiOutput: string | any;
  context?: string;
  questionText?: string;
  label?: string;
  variant?: 'compact' | 'pill' | 'icon' | 'badge';
  className?: string;
}> = ({
  aiOutput,
  context = 'AI Output',
  questionText,
  label = 'Report',
  variant = 'compact',
  className = ''
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);

  const safeOutput = typeof aiOutput === 'string' ? aiOutput : (aiOutput ? JSON.stringify(aiOutput, null, 2) : '');
  if (!safeOutput || !safeOutput.trim()) {
    return null;
  }

  let buttonContent = (
    <>
      <Flag className="w-3 h-3 text-red-500/80 group-hover:text-red-400 transition-colors" />
      <span>{label}</span>
    </>
  );

  let defaultStyles = "inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-red-400 hover:bg-red-500/10 px-2 py-1 rounded-lg transition-all cursor-pointer group";

  if (variant === 'pill') {
    defaultStyles = "inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-red-400/90 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 px-2.5 py-1 rounded-full transition-all cursor-pointer group";
    buttonContent = (
      <>
        <Flag className="w-2.5 h-2.5 text-red-400" />
        <span>Report AI</span>
      </>
    );
  } else if (variant === 'icon') {
    defaultStyles = "p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all cursor-pointer group";
    buttonContent = <Flag className="w-3.5 h-3.5" />;
  } else if (variant === 'badge') {
    defaultStyles = "inline-flex items-center gap-1 text-[10px] text-slate-400 hover:text-red-400 transition-colors cursor-pointer";
    buttonContent = (
      <>
        <Flag className="w-3 h-3 text-red-500/70" />
        <span>Report AI issue</span>
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsOpen(true);
        }}
        className={`${defaultStyles} ${className}`}
        title="Report inaccurate or abusive AI output to developer"
      >
        {buttonContent}
      </button>

      <ReportAiModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        aiOutput={safeOutput}
        context={context}
        questionText={questionText}
      />
    </>
  );
};

export default ReportAiModal;
