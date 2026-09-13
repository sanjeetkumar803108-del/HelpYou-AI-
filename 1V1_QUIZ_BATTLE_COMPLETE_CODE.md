# ⚔️ 1v1 Live Quiz Battle — Complete Codebase

Yeh file **1v1 Live Quiz Battle** feature ke saare components, services, audio engine, questions data, aur backend server logic ka complete code ek hi jagah provide karti hai.

---

## 📑 Index of Included Modules
1. [Frontend UI Component (`APQuizBattle.tsx`)](#1-frontend-ui-component-apquizbattletsx)
2. [Real-Time Sync Engine (`battleSync.ts`)](#2-real-time-sync-engine-battlesyncts)
3. [Synthesized Audio Engine (`quizBattleAudio.ts`)](#3-synthesized-audio-engine-quizbattleaudiots)
4. [Question Bank & Subjects Data (`quizBattleBank.ts`)](#4-question-bank--subjects-data-quizbattlebankts)
5. [Backend Server Routes & Matchmaker (`server.ts`)](#5-backend-server-routes--matchmaker-serverts)

---

## 1. Frontend UI Component (`APQuizBattle.tsx`)
**File Path**: `src/components/APQuizBattle.tsx`
- Complete Game Loop: Lobby, Quick Matchmaking (15s Radar Search), 3-2-1 Countdown, Real-Time Duel Arena, Victory / Defeat Screen.
- KaTeX Math & Science Formula Rendering, Speed Bonus Calculation, Confetti Celebrations, Slide-down Subject Selector, Friend Private Room (Create & Join with Code).

```tsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowLeft, Swords, Users, Copy, Check, Share2, 
  Trophy, Zap, Clock, RotateCcw, 
  ChevronRight, Award, Volume2, VolumeX, Radio, ShieldCheck, Loader2, Sparkles,
  Target, ChevronDown, Search, X
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { triggerVibration } from '../utils/vibrate';
import { addCoins } from '../utils/coins';
import { getUserProfileData } from '../utils/profile';
import { battleAudio } from '../utils/quizBattleAudio';
import { 
  AP_BATTLE_SUBJECTS, 
  BattleQuestion, 
  GhostPlayer, 
  getBattleQuestions, 
  getRandomGhostPlayer 
} from '../data/quizBattleBank';
import { battleSync, PlayerProfile, BattleRoom } from '../services/battleSync';
import GlobalMarkdown, { prepareQuizMath } from './GlobalMarkdown';

interface APQuizBattleProps {
  onBack: () => void;
  user?: any;
  isVip?: boolean;
}

type BattlePhase = 'LOBBY' | 'MATCHMAKING' | 'COUNTDOWN' | 'BATTLE' | 'VICTORY';

export const APQuizBattle: React.FC<APQuizBattleProps> = ({ onBack, user, isVip }) => {
  // 1. Session & 100% Unique Tab ID (generated in memory per mount, avoids cross-tab pollution)
  const tabSessionId = useRef<string>(
    `tab_${Date.now()}_${Math.random().toString(36).substring(2, 9)}_${Math.floor(1000 + Math.random() * 9000)}`
  ).current;

  const myProfileData = getUserProfileData();
  const rawName = (
    user?.displayName || 
    (user?.email ? user.email.split('@')[0] : '') || 
    myProfileData?.userName || 
    'Student'
  );
  const myName = rawName.charAt(0).toUpperCase() + rawName.slice(1);
  const myAvatar = myName[0]?.toUpperCase() || 'U';

  const myId = useRef<string>(
    user?.uid ? `${user.uid}_${tabSessionId}` : `player_${tabSessionId}`
  ).current;

  // 2. Core State
  const [phase, setPhase] = useState<BattlePhase>('LOBBY');
  const phaseRef = useRef<BattlePhase>('LOBBY');
  phaseRef.current = phase;

  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('ap-calculus-ab');
  const [showSubjectPicker, setShowSubjectPicker] = useState<boolean>(false);
  const [subjectSearchQuery, setSubjectSearchQuery] = useState<string>('');
  const [subjectCategoryFilter, setSubjectCategoryFilter] = useState<string>('All');

  // Enrich AP_BATTLE_SUBJECTS with categories for clean filtered selection
  const enrichedSubjects = useMemo(() => {
    return AP_BATTLE_SUBJECTS.map(s => {
      let cat = 'STEM & Math';
      if (['ap-physics', 'ap-chemistry', 'ap-biology', 'ap-environmental-science'].includes(s.id)) {
        cat = 'Sciences';
      } else if (['ap-us-history', 'ap-world-history', 'ap-human-geography', 'ap-psychology', 'ap-economics'].includes(s.id)) {
        cat = 'History & Social';
      } else if (['ap-english-lang'].includes(s.id)) {
        cat = 'English';
      }
      return { ...s, category: cat };
    });
  }, []);

  const filteredBattleSubjects = useMemo(() => {
    return enrichedSubjects.filter(s => {
      if (subjectCategoryFilter !== 'All' && s.category !== subjectCategoryFilter) return false;
      if (!subjectSearchQuery.trim()) return true;
      const q = subjectSearchQuery.toLowerCase();
      return s.name.toLowerCase().includes(q) || s.category.toLowerCase().includes(q);
    });
  }, [enrichedSubjects, subjectCategoryFilter, subjectSearchQuery]);
  const [roomCode, setRoomCode] = useState<string>(() => `AP-${Math.floor(1000 + Math.random() * 9000)}`);
  const [joinInputCode, setJoinInputCode] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  // Matchmaking Search Countdown (Strict 15 seconds)
  const [searchSecondsLeft, setSearchSecondsLeft] = useState<number>(15);

  // Opponent Details
  const [isRealOpponent, setIsRealOpponent] = useState<boolean>(false);
  const isRealOpponentRef = useRef<boolean>(false);
  isRealOpponentRef.current = isRealOpponent;

  const [opponent, setOpponent] = useState<GhostPlayer | PlayerProfile | null>(null);
  const [liveRoomId, setLiveRoomId] = useState<string | null>(null);
  const liveRoomIdRef = useRef<string | null>(null);
  liveRoomIdRef.current = liveRoomId;

  // Countdown & Questions
  const [countdownNum, setCountdownNum] = useState<number>(3);
  const [questions, setQuestions] = useState<BattleQuestion[]>([]);
  const questionsRef = useRef<BattleQuestion[]>([]);
  const [currentQIndex, setCurrentQIndex] = useState<number>(0);
  const currentQIndexRef = useRef<number>(0);
  const [timeLeft, setTimeLeft] = useState<number>(15);

  // Scores & Answers
  const [userScore, setUserScore] = useState<number>(0);
  const userScoreRef = useRef<number>(0);
  const [userSelectedOption, setUserSelectedOption] = useState<number | null>(null);
  const [userAnswerStatus, setUserAnswerStatus] = useState<'idle' | 'answered'>('idle');
  const userStatusRef = useRef<'idle' | 'answered'>('idle');

  // Opponent State
  const [opponentScore, setOpponentScore] = useState<number>(0);
  const oppScoreRef = useRef<number>(0);
  const [opponentAnswerStatus, setOpponentAnswerStatus] = useState<'thinking' | 'answered'>('thinking');
  const oppStatusRef = useRef<'thinking' | 'answered'>('thinking');

  // Synchronized Round Reveal
  const [roundRevealed, setRoundRevealed] = useState<boolean>(false);
  const roundRevealedRef = useRef<boolean>(false);

  // Audio Toggle
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  // Timers & Subscriptions Refs
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const opponentTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const roundAdvanceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const searchCountdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const stopPollingRef = useRef<(() => void) | null>(null);
  const roomUnsubRef = useRef<(() => void) | null>(null);
  const battleFinishedRef = useRef<boolean>(false);

  const playSound = (soundFn: () => void) => {
    if (soundEnabled) {
      try { soundFn(); } catch {}
    }
  };

  // Safe Opponent Avatar without any broken unicode or question marks
  const getOpponentAvatar = () => {
    if (!opponent) return 'R';
    const av = opponent.avatar;
    if (!av || av.includes('?') || av.length > 2) {
      return opponent.name ? opponent.name.charAt(0).toUpperCase() : 'R';
    }
    return av;
  };

  // Opponent Student Banner / Tagline Badge (Authentic Student Status)
  const getOpponentTagline = () => {
    if (!opponent) return 'AP Scholar';
    if ((opponent as any).tagline) {
      const tag = String((opponent as any).tagline).replace(/[^ -~]/g, ' - ').replace(/Rival/gi, 'Scholar');
      if (tag.toLowerCase().includes('real online') || tag.toLowerCase().includes('bot')) {
        return 'AP Scholar';
      }
      return tag;
    }
    return 'AP Scholar';
  };

  // Centralized cleanup: clears all timeouts, polling, and leaves server queue
  const cleanupAllBattleState = () => {
    battleFinishedRef.current = false;
    try { (confetti as any).reset?.(); } catch {}
    if (timerRef.current) clearInterval(timerRef.current);
    if (opponentTimeoutRef.current) clearTimeout(opponentTimeoutRef.current);
    if (roundAdvanceTimeoutRef.current) clearTimeout(roundAdvanceTimeoutRef.current);
    if (searchCountdownIntervalRef.current) clearInterval(searchCountdownIntervalRef.current);
    if (stopPollingRef.current) {
      stopPollingRef.current();
      stopPollingRef.current = null;
    }
    if (roomUnsubRef.current) {
      roomUnsubRef.current();
      roomUnsubRef.current = null;
    }
    battleSync.leaveQueue(myId, liveRoomIdRef.current || undefined);
  };

  // ================= MATCHMAKING & PAIRING =================

  // 1. Matched with Real Player
  const handleMatchedWithRealPlayer = (
    roomId: string, 
    matchedOpponent: PlayerProfile, 
    matchedQuestions: BattleQuestion[],
    matchedSubjectId?: string
  ) => {
    if (searchCountdownIntervalRef.current) clearInterval(searchCountdownIntervalRef.current);
    if (stopPollingRef.current) {
      stopPollingRef.current();
      stopPollingRef.current = null;
    }

    const effectiveSubject = matchedSubjectId || matchedQuestions?.[0]?.subjectId;
    if (effectiveSubject) {
      setSelectedSubjectId(effectiveSubject);
    }

    setIsRealOpponent(true);
    isRealOpponentRef.current = true;
    setLiveRoomId(roomId);
    liveRoomIdRef.current = roomId;
    setOpponent(matchedOpponent);
    setQuestions(matchedQuestions);
    questionsRef.current = matchedQuestions;

    subscribeToLiveBattle(roomId);
    setPhase('COUNTDOWN');
    setCountdownNum(3);
  };

  // 2. Start Quick Match (15 seconds search)
  const startQuickMatch = async () => {
    cleanupAllBattleState();
    triggerVibration(25);
    playSound(() => battleAudio.playBattleStart());

    setPhase('MATCHMAKING');
    setIsRealOpponent(false);
    isRealOpponentRef.current = false;
    setJoinError(null);
    setSearchSecondsLeft(15);

    const initialQs = getBattleQuestions(selectedSubjectId, 5);
    setQuestions(initialQs);
    questionsRef.current = initialQs;

    // Call server to match or enter active queue
    const matchResult = await battleSync.enterMatchQueue(
      myId,
      myName,
      myAvatar,
      selectedSubjectId,
      initialQs
    );

    if (matchResult.status === 'matched' && matchResult.roomId && matchResult.opponent) {
      handleMatchedWithRealPlayer(
        matchResult.roomId,
        matchResult.opponent,
        matchResult.questions || initialQs,
        matchResult.subjectId
      );
      return;
    }

    // Actively poll server every 350ms (heartbeat keeps player alive on radar)
    const stopPoll = battleSync.startQueuePolling(myId, (roomId, matchedOpponent, matchedQuestions, isPlayer1, matchedSubj) => {
      handleMatchedWithRealPlayer(roomId, matchedOpponent, matchedQuestions, matchedSubj);
    });
    stopPollingRef.current = stopPoll;

    // 15-SECOND SEARCH COUNTDOWN
    searchCountdownIntervalRef.current = setInterval(() => {
      setSearchSecondsLeft(prev => {
        if (prev <= 1) {
          clearInterval(searchCountdownIntervalRef.current!);
          // 15 seconds expired without finding another active real player -> pair with practice rival
          handleSearchTimeout(initialQs);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // 3. Fallback to Ghost practice rival after 15 full seconds of searching
  const handleSearchTimeout = async (fallbackQs: BattleQuestion[]) => {
    cleanupAllBattleState();

    const ghost = getRandomGhostPlayer(selectedSubjectId);
    setIsRealOpponent(false);
    isRealOpponentRef.current = false;
    setLiveRoomId(null);
    liveRoomIdRef.current = null;
    setQuestions(fallbackQs);
    questionsRef.current = fallbackQs;
    setOpponent(ghost);
    setPhase('COUNTDOWN');
    setCountdownNum(3);
  };

  // 4. Friend Room: Create Room
  const handleHostFriendRoom = async () => {
    cleanupAllBattleState();
    triggerVibration(20);
    playSound(() => battleAudio.playBattleStart());

    setPhase('MATCHMAKING');
    setIsRealOpponent(true);
    isRealOpponentRef.current = true;
    setJoinError(null);
    setSearchSecondsLeft(60);

    const initialQs = getBattleQuestions(selectedSubjectId, 5);
    setQuestions(initialQs);
    questionsRef.current = initialQs;

    const myProfile: PlayerProfile = {
      id: myId,
      name: myName,
      avatar: myAvatar,
      isRealPlayer: true,
      score: 0,
      hasAnswered: false,
      currentQ: 0
    };

    const res = await battleSync.createFriendRoom(roomCode, myProfile, selectedSubjectId, initialQs);
    if (!res.success || !res.roomId) {
      setJoinError('Could not create room. Please try again.');
      setPhase('LOBBY');
      return;
    }

    const roomId = res.roomId;
    setLiveRoomId(roomId);
    liveRoomIdRef.current = roomId;

    const stopRoomPolling = battleSync.subscribeToRoomUpdates(roomId, myId, (room, opp) => {
      if (opp && opp.id !== myId) {
        handleMatchedWithRealPlayer(roomId, opp, initialQs, selectedSubjectId);
      }
    });
    roomUnsubRef.current = stopRoomPolling;
  };

  // 5. Friend Room: Join Room
  const handleJoinFriendRoom = async () => {
    if (joinInputCode.trim().length < 4) return;
    cleanupAllBattleState();
    triggerVibration(20);
    setJoinError(null);

    const myProfile: PlayerProfile = {
      id: myId,
      name: myName,
      avatar: myAvatar,
      isRealPlayer: true,
      score: 0,
      hasAnswered: false,
      currentQ: 0
    };

    const res = await battleSync.joinFriendRoom(joinInputCode.trim(), myProfile);
    if (!res.success || !res.roomId || !res.opponent) {
      triggerVibration(50);
      setJoinError('Invalid Room Code or Room already in progress!');
      return;
    }

    const hostSubject = res.subjectId || res.questions?.[0]?.subjectId || selectedSubjectId;
    setSelectedSubjectId(hostSubject);

    handleMatchedWithRealPlayer(
      res.roomId,
      res.opponent,
      res.questions || getBattleQuestions(hostSubject, 5),
      hostSubject
    );
  };

  // 6. Real-Time Room Updates during Battle (Server-driven Sync)
  const subscribeToLiveBattle = (roomId: string) => {
    if (roomUnsubRef.current) roomUnsubRef.current();

    roomUnsubRef.current = battleSync.subscribeToRoomUpdates(roomId, myId, (room: BattleRoom, opp: PlayerProfile | null) => {
      if (!room) return;

      // Sync room subject chosen by the room creator
      if (room.subjectId && room.subjectId !== selectedSubjectId) {
        setSelectedSubjectId(room.subjectId);
      }

      // Opponent score & answered status updates
      if (opp) {
        setOpponentScore(opp.score || 0);
        oppScoreRef.current = opp.score || 0;
        setOpponentAnswerStatus(opp.hasAnswered ? 'answered' : 'thinking');
        oppStatusRef.current = opp.hasAnswered ? 'answered' : 'thinking';

        // If both players have answered, trigger round reveal immediately!
        if (opp.hasAnswered && userStatusRef.current === 'answered' && !roundRevealedRef.current) {
          triggerRoundReveal();
        }
      }

      // 1. Room Finished
      if (room.status === 'finished') {
        if (!battleFinishedRef.current) {
          finishBattle();
        }
        return;
      }

      // 2. Synchronized Round Reveal
      if (room.roundStatus === 'revealed') {
        if (!roundRevealedRef.current) {
          setRoundRevealed(true);
          roundRevealedRef.current = true;
          playSound(() => battleAudio.playOpponentAction());
        }
      }

      // 3. Synchronized Round Progression
      if (room.roundStatus === 'playing') {
        // Synchronize remaining seconds with server roundStartTime
        if (room.roundStartTime) {
          const currQ = questions[currentQIndexRef.current] || room.questions?.[room.currentQ];
          const maxRoundSec = currQ?.timeLimit || 30;
          const elapsed = Math.floor((Date.now() - room.roundStartTime) / 1000);
          const remaining = Math.max(0, maxRoundSec - elapsed);
          setTimeLeft(remaining);
        }

        // Check if server advanced to next question
        if (typeof room.currentQ === 'number' && room.currentQ !== currentQIndexRef.current) {
          const nextIdx = room.currentQ;
          setCurrentQIndex(nextIdx);
          currentQIndexRef.current = nextIdx;
          startQuestionRound(nextIdx);
        }
      }
    });
  };

  // 7. Cancel Matchmaking
  const handleCancelMatchmaking = () => {
    cleanupAllBattleState();
    setPhase('LOBBY');
  };

  // ================= BATTLE ROUND SYNCHRONIZATION =================

  // 8. 3-2-1 Countdown
  useEffect(() => {
    if (phase === 'COUNTDOWN') {
      triggerVibration(20);
      playSound(() => battleAudio.playTick());
      if (countdownNum > 1) {
        const t = setTimeout(() => setCountdownNum(prev => prev - 1), 900);
        return () => clearTimeout(t);
      } else {
        const t = setTimeout(() => {
          initBattleArena();
        }, 900);
        return () => clearTimeout(t);
      }
    }
  }, [phase, countdownNum]);

  // 9. Initialize Arena
  const initBattleArena = () => {
    setUserScore(0);
    userScoreRef.current = 0;
    setOpponentScore(0);
    oppScoreRef.current = 0;
    setCurrentQIndex(0);
    currentQIndexRef.current = 0;
    setPhase('BATTLE');
    startQuestionRound(0);
  };

  // 10. Start Synchronized Question Round
  const startQuestionRound = (qIdx: number) => {
    const activeQ = questions[qIdx];
    const initialTimeLimit = activeQ?.timeLimit || 30;
    setTimeLeft(initialTimeLimit);
    setUserSelectedOption(null);
    setUserAnswerStatus('idle');
    setOpponentAnswerStatus('thinking');
    setRoundRevealed(false);
    userStatusRef.current = 'idle';
    oppStatusRef.current = 'thinking';
    roundRevealedRef.current = false;
    currentQIndexRef.current = qIdx;

    if (timerRef.current) clearInterval(timerRef.current);
    if (opponentTimeoutRef.current) clearTimeout(opponentTimeoutRef.current);
    if (roundAdvanceTimeoutRef.current) clearTimeout(roundAdvanceTimeoutRef.current);

    // Notify server of new round ready
    if (liveRoomIdRef.current) {
      battleSync.updatePlayerAction(liveRoomIdRef.current, myId, userScoreRef.current, false, false);
    }

    // 15s Countdown clock
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          handleRoundTimeout();
          return 0;
        }
        if (prev <= 5) {
          playSound(() => battleAudio.playUrgentTick());
          triggerVibration(10);
        } else {
          playSound(() => battleAudio.playTick());
        }
        return prev - 1;
      });
    }, 1000);

    // If opponent is Ghost practice rival: simulate realistic human response
    if (!isRealOpponentRef.current && opponent) {
      const ghost = opponent as GhostPlayer;
      const delay = (ghost.timings && ghost.timings[qIdx]) ? ghost.timings[qIdx] : 4500;
      
      opponentTimeoutRef.current = setTimeout(() => {
        setOpponentAnswerStatus('answered');
        oppStatusRef.current = 'answered';
        playSound(() => battleAudio.playOpponentAction());

        const isCorrect = (ghost.accuracy && ghost.accuracy[qIdx] !== undefined) 
          ? ghost.accuracy[qIdx] 
          : false;

        if (isCorrect) {
          const speedBonus = Math.max(1, Math.min(4, Math.floor((15000 - delay) / 3200)));
          setOpponentScore(sc => {
            const next = sc + 10 + speedBonus;
            oppScoreRef.current = next;
            return next;
          });
        }

        // If user already answered, trigger round reveal!
        if (userStatusRef.current === 'answered' && !roundRevealedRef.current) {
          triggerRoundReveal();
        }
      }, delay);
    }
  };

  // 11. User Selects Option (Answer Locked)
  const handleSelectOption = async (optionIndex: number) => {
    if (userAnswerStatus === 'answered' || phase !== 'BATTLE' || roundRevealedRef.current) return;

    const currQ = questions[currentQIndex];
    if (!currQ) return;

    const isCorrect = optionIndex === currQ.correctIndex;
    setUserSelectedOption(optionIndex);
    setUserAnswerStatus('answered');
    userStatusRef.current = 'answered';

    let newScore = userScoreRef.current;
    if (isCorrect) {
      triggerVibration(30);
      playSound(() => battleAudio.playCorrect());
      const maxTime = currQ.timeLimit || 30;
      const speedBonus = Math.max(1, Math.min(5, Math.ceil((timeLeft / maxTime) * 5)));
      newScore = userScoreRef.current + 10 + speedBonus;
      setUserScore(newScore);
      userScoreRef.current = newScore;
    } else {
      triggerVibration(50);
      playSound(() => battleAudio.playWrong());
    }

    const isLastQ = currentQIndex + 1 === questions.length;
    if (liveRoomIdRef.current) {
      battleSync.updatePlayerAction(liveRoomIdRef.current, myId, newScore, true, isLastQ);
    }

    // If opponent has already answered (whether Real or Ghost), trigger round reveal immediately!
    if (oppStatusRef.current === 'answered' && !roundRevealedRef.current) {
      triggerRoundReveal();
    }
  };

  // 12. Round Reveal (for Ghost Bot matches)
  const triggerRoundReveal = () => {
    if (roundRevealedRef.current) return;
    setRoundRevealed(true);
    roundRevealedRef.current = true;

    if (timerRef.current) clearInterval(timerRef.current);
    if (opponentTimeoutRef.current) clearTimeout(opponentTimeoutRef.current);

    roundAdvanceTimeoutRef.current = setTimeout(() => {
      advanceNextQuestion();
    }, 2000);
  };

  // 13. Round Timeout (15s expired)
  const handleRoundTimeout = async () => {
    if (userStatusRef.current === 'idle') {
      setUserAnswerStatus('answered');
      userStatusRef.current = 'answered';
      playSound(() => battleAudio.playWrong());
      triggerVibration(40);

      const isLastQ = currentQIndex + 1 === questions.length;
      if (liveRoomIdRef.current) {
        battleSync.updatePlayerAction(liveRoomIdRef.current, myId, userScoreRef.current, true, isLastQ);
      }
    }

    if (!isRealOpponentRef.current) {
      if (oppStatusRef.current === 'thinking') {
        setOpponentAnswerStatus('answered');
        oppStatusRef.current = 'answered';
      }
      triggerRoundReveal();
    }
  };

  // 14. Advance Question (for Ghost matches)
  const advanceNextQuestion = () => {
    const nextIdx = currentQIndexRef.current + 1;
    if (nextIdx < questionsRef.current.length) {
      setCurrentQIndex(nextIdx);
      currentQIndexRef.current = nextIdx;
      startQuestionRound(nextIdx);
    } else {
      if (!battleFinishedRef.current) {
        finishBattle();
      }
    }
  };

  // 15. Finish Battle (Strict Single Execution & Outcome-specific Audio/Animations)
  const finishBattle = () => {
    // PREVENT MULTIPLE INVOCATIONS - strictly execute once!
    if (battleFinishedRef.current) return;
    battleFinishedRef.current = true;

    // Immediately stop listening to room updates so no duplicate snapshots or triggers fire
    if (roomUnsubRef.current) {
      roomUnsubRef.current();
      roomUnsubRef.current = null;
    }

    if (timerRef.current) clearInterval(timerRef.current);
    if (opponentTimeoutRef.current) clearTimeout(opponentTimeoutRef.current);
    if (roundAdvanceTimeoutRef.current) clearTimeout(roundAdvanceTimeoutRef.current);

    if (liveRoomIdRef.current) {
      battleSync.updatePlayerAction(liveRoomIdRef.current, myId, userScoreRef.current, true, true);
    }

    setPhase('VICTORY');

    const finalUser = userScoreRef.current;
    const finalOpp = oppScoreRef.current;
    const isWinner = finalUser > finalOpp;
    const isTie = finalUser === finalOpp;

    if (isWinner) {
      // WINNER: Victory fanfare + one crisp confetti celebration burst!
      playSound(() => battleAudio.playVictory());
      triggerVibration(60);

      try {
        confetti({
          particleCount: 85,
          spread: 70,
          origin: { y: 0.6 }
        });
      } catch {}

      addCoins(25, '1v1 Battle Victory');
    } else if (isTie) {
      // DRAW: Balanced draw chime, strictly NO confetti!
      playSound(() => battleAudio.playDraw());
      triggerVibration(25);
      try { (confetti as any).reset?.(); } catch {}
      addCoins(10, '1v1 Battle Draw');
    } else {
      // DEFEAT / LOSS: Gentle defeat chime, strictly NO confetti!
      playSound(() => battleAudio.playDefeat());
      triggerVibration(35);
      try { (confetti as any).reset?.(); } catch {}
      addCoins(10, '1v1 Battle Consolation');
    }
  };

  // Cleanup strictly on unmount
  useEffect(() => {
    return () => {
      cleanupAllBattleState();
    };
  }, []);

  const currentQ = questions[currentQIndex];
  // Dynamically resolve active subject: prioritize current/room question's subject, fallback to selectedSubjectId
  const qSubjectId = currentQ?.subjectId || questions[0]?.subjectId;
  const activeSubject = AP_BATTLE_SUBJECTS.find(s => 
    (qSubjectId && (s.id === qSubjectId || (s.id === "ap-physics" && qSubjectId === "ap-physics-1"))) ||
    s.id === selectedSubjectId || 
    (s.id === "ap-physics" && selectedSubjectId === "ap-physics-1")
  ) || AP_BATTLE_SUBJECTS[0];

  // ================= RENDER: LOBBY =================
  if (phase === 'LOBBY') {
    return (
      <div className="w-full h-full min-h-screen bg-zinc-950 text-white flex flex-col justify-between overflow-y-auto select-none font-sans p-5">
        <div className="flex items-center justify-between">
          <button
            onClick={() => {
              cleanupAllBattleState();
              triggerVibration(15);
              onBack();
            }}
            className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-300 hover:text-white active:scale-95 transition-all cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <span className="text-xs font-bold text-emerald-400 tracking-wide uppercase">Live Battle Arena</span>
          </div>

          <button
            onClick={() => {
              triggerVibration(10);
              setSoundEnabled(!soundEnabled);
            }}
            className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-300 hover:text-white active:scale-95 transition-all cursor-pointer"
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-zinc-500" />}
          </button>
        </div>

        <div className="max-w-md w-full mx-auto my-auto flex flex-col gap-6 py-4">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-500 text-white shadow-xl shadow-indigo-500/20 mb-3">
              <Swords className="w-8 h-8" />
            </div>
            <h1 className="text-3xl font-black tracking-tight text-white uppercase">1v1 Quiz Battle</h1>
            <p className="text-xs text-zinc-400 mt-1 font-medium">Challenge real AP scholars live or invite friends</p>
          </div>

          {/* Slide-Down Subject Selector Trigger Card */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Select Battle Subject</span>
              <button
                type="button"
                onClick={() => {
                  triggerVibration(10);
                  setSubjectSearchQuery('');
                  setShowSubjectPicker(true);
                }}
                className="text-[10px] text-indigo-400 font-bold bg-indigo-950/80 hover:bg-indigo-900/80 px-2.5 py-0.5 rounded-full border border-indigo-500/30 cursor-pointer transition-colors"
              >
                Tap to Change
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                triggerVibration(10);
                setSubjectSearchQuery('');
                setShowSubjectPicker(true);
              }}
              className="w-full bg-zinc-900/90 hover:bg-zinc-850 border-2 border-zinc-800 hover:border-indigo-500/70 rounded-2xl p-3.5 flex items-center justify-between transition-all cursor-pointer shadow-md group text-left active:scale-[0.99]"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-11 h-11 rounded-2xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-2xl shrink-0 group-hover:scale-105 transition-transform text-indigo-300 shadow-inner">
                  {activeSubject?.icon || '📐'}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-[9px] font-black uppercase tracking-wider bg-indigo-950 text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-500/30">
                      15 Questions Bank
                    </span>
                    <span className="text-[10px] text-zinc-400 font-medium truncate">
                      College Board AP
                    </span>
                  </div>
                  <h4 className="text-sm font-black text-white truncate">
                    {activeSubject?.name || 'AP Calculus AB'}
                  </h4>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs font-bold text-indigo-400 hidden sm:inline">Change</span>
                <ChevronDown className="w-5 h-5 text-zinc-400 group-hover:text-indigo-400 transition-colors shrink-0" />
              </div>
            </button>
          </div>

          {/* Action 1: Quick Match */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={startQuickMatch}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-violet-600 via-indigo-600 to-purple-600 text-white font-extrabold text-sm uppercase tracking-wider shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 cursor-pointer transition-all"
          >
            <Radio className="w-4 h-4 text-emerald-300 animate-pulse" />
            <span>Find Real Player (15s Radar)</span>
          </motion.button>

          {/* Action 2: Friend Room */}
          <div className="bg-zinc-900/80 border border-zinc-800/80 rounded-2xl p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-indigo-400" />
                <span>Play with a Friend</span>
              </span>
              <span className="text-[10px] text-zinc-500 font-mono">CODE: {roomCode}</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleHostFriendRoom}
                className="py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-750 border border-zinc-700 text-white text-xs font-bold transition-all cursor-pointer"
              >
                Create Room
              </button>
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(roomCode);
                    setCopied(true);
                    triggerVibration(15);
                    setTimeout(() => setCopied(false), 2000);
                  } catch {}
                }}
                className="py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-750 border border-zinc-700 text-zinc-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy Code'}</span>
              </button>
            </div>

            <div className="flex items-center gap-2 mt-1">
              <input
                type="text"
                value={joinInputCode}
                onChange={(e) => setJoinInputCode(e.target.value.toUpperCase())}
                placeholder="Enter 6-digit code..."
                maxLength={8}
                className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs font-mono uppercase text-white placeholder-zinc-600 focus:outline-none focus:border-indigo-500"
              />
              <button
                onClick={handleJoinFriendRoom}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-xs font-bold text-white transition-all cursor-pointer"
              >
                Join
              </button>
            </div>

            {joinError && (
              <span className="text-[11px] text-rose-400 font-medium text-center">{joinError}</span>
            )}
          </div>
        </div>

        <div className="text-center text-[10px] text-zinc-600">
          5 Questions • 30s to 60s By Difficulty • Real-time Synchronized
        </div>
      
        {/* ================= PREMIUM SLIDE-DOWN SUBJECT SELECTION MODAL ================= */}
        <AnimatePresence>
          {showSubjectPicker && (
            <div 
              onClick={() => setShowSubjectPicker(false)}
              className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in"
            >
              <motion.div
                onClick={(e) => e.stopPropagation()}
                initial={{ opacity: 0, y: 70, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 70, scale: 0.97 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
                className="w-full max-w-lg bg-zinc-950 rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl border border-zinc-800 overflow-hidden flex flex-col max-h-[88vh]"
              >
                {/* Drag handle for mobile */}
                <div className="w-12 h-1.5 bg-zinc-800 rounded-full mx-auto mt-3 sm:hidden" />

                {/* Modal Header */}
                <div className="p-4 sm:p-5 border-b border-zinc-850 flex items-center justify-between bg-gradient-to-r from-zinc-900 via-indigo-950/40 to-zinc-900 shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-600/30 text-lg shrink-0">
                      ⚔️
                    </div>
                    <div>
                      <h3 className="font-black text-sm sm:text-base text-white leading-tight">
                        Select Battle Subject
                      </h3>
                      <p className="text-[11px] text-zinc-400 font-medium">
                        Official AP Curriculum ({AP_BATTLE_SUBJECTS.length} Subjects)
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      triggerVibration(10);
                      setShowSubjectPicker(false);
                    }}
                    className="w-8 h-8 rounded-full bg-zinc-900 hover:bg-zinc-850 text-zinc-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer border border-zinc-800"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Search Bar & Category Filter */}
                <div className="p-3.5 border-b border-zinc-850 bg-zinc-900/60 shrink-0 space-y-2.5">
                  <div className="relative">
                    <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={subjectSearchQuery}
                      onChange={(e) => setSubjectSearchQuery(e.target.value)}
                      placeholder="Search AP subjects (e.g. Calculus, Physics, Bio)..."
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-9 pr-8 py-2 text-xs font-semibold text-white placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                    />
                    {subjectSearchQuery && (
                      <button
                        onClick={() => setSubjectSearchQuery('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white p-0.5"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Category Filter Pills */}
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
                    {['All', 'STEM & Math', 'Sciences', 'History & Social', 'English'].map(cat => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => {
                          triggerVibration(10);
                          setSubjectCategoryFilter(cat);
                        }}
                        className={`text-[10px] font-bold px-2.5 py-1 rounded-lg transition-all shrink-0 cursor-pointer ${
                          subjectCategoryFilter === cat
                            ? 'bg-indigo-600 text-white shadow-xs'
                            : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:bg-zinc-850 hover:text-zinc-200'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Subject Scrollable List */}
                <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2 custom-scrollbar">
                  {filteredBattleSubjects.length === 0 ? (
                    <div className="py-12 text-center text-zinc-500 space-y-1">
                      <p className="text-sm font-bold text-zinc-300">No matching subjects found</p>
                      <p className="text-xs">Try searching with a different name or keyword</p>
                    </div>
                  ) : (
                    filteredBattleSubjects.map((subj) => {
                      const isSelected = selectedSubjectId === subj.id;
                      return (
                        <button
                          key={subj.id}
                          type="button"
                          onClick={() => {
                            triggerVibration(15);
                            setSelectedSubjectId(subj.id);
                            setShowSubjectPicker(false);
                          }}
                          className={`w-full p-3 rounded-2xl border-2 transition-all flex items-center justify-between gap-3 text-left cursor-pointer active:scale-[0.99] ${
                            isSelected
                              ? 'bg-indigo-950/60 border-indigo-500 shadow-md ring-1 ring-indigo-500/30'
                              : 'bg-zinc-900/70 border-zinc-850 hover:border-zinc-750 hover:bg-zinc-900'
                          }`}
                        >
                          <div className="flex items-center gap-3.5 min-w-0">
                            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center text-xl shrink-0 border ${
                              isSelected ? 'bg-indigo-600/30 border-indigo-500/50 text-white' : 'bg-zinc-950 border-zinc-800 text-zinc-300'
                            }`}>
                              {subj.icon}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-300 border border-zinc-700">
                                  15 Battle Questions
                                </span>
                                <span className="text-[10px] text-zinc-400 font-semibold truncate">
                                  {subj.category}
                                </span>
                              </div>
                              <h4 className={`text-xs sm:text-sm font-black truncate ${isSelected ? 'text-indigo-300' : 'text-white'}`}>
                                {subj.name}
                              </h4>
                            </div>
                          </div>

                          {isSelected ? (
                            <div className="w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                              <Check className="w-4 h-4" />
                            </div>
                          ) : (
                            <div className="w-7 h-7 rounded-full border border-zinc-700 shrink-0" />
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
</div>
    );
  }

  // ================= RENDER: MATCHMAKING RADAR =================
  if (phase === 'MATCHMAKING') {
    return (
      <div className="w-full h-full min-h-screen bg-zinc-950 text-white flex flex-col justify-between items-center p-6 select-none font-sans">
        <div className="w-full flex items-center justify-between max-w-md">
          <button
            onClick={handleCancelMatchmaking}
            className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Searching Arena</span>
          <div className="w-10"></div>
        </div>

        <div className="flex flex-col items-center justify-center my-auto text-center max-w-xs">
          {/* Radar Circles */}
          <div className="relative w-48 h-48 flex items-center justify-center mb-8">
            <motion.div
              animate={{ scale: [1, 2.2], opacity: [0.8, 0] }}
              transition={{ repeat: Infinity, duration: 2, ease: "easeOut" }}
              className="absolute w-24 h-24 rounded-full border border-indigo-500/40 bg-indigo-500/10"
            />
            <motion.div
              animate={{ scale: [1, 2.8], opacity: [0.6, 0] }}
              transition={{ repeat: Infinity, duration: 2.4, ease: "easeOut", delay: 0.5 }}
              className="absolute w-24 h-24 rounded-full border border-purple-500/30 bg-purple-500/5"
            />
            <div className="relative z-10 w-24 h-24 rounded-full bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center shadow-xl shadow-indigo-600/30 border-2 border-white/20">
              <span className="text-3xl font-black">{myAvatar}</span>
            </div>
          </div>

          <h2 className="text-xl font-extrabold text-white mb-1">Finding Opponent...</h2>
          <p className="text-xs text-zinc-400 mb-4">Searching online AP scholars worldwide</p>

          <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 px-4 py-2 rounded-full">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-xs font-mono font-bold text-zinc-300">
              {searchSecondsLeft}s remaining
            </span>
          </div>
        </div>

        <button
          onClick={handleCancelMatchmaking}
          className="max-w-xs w-full py-3.5 rounded-2xl bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 text-zinc-400 hover:text-white font-bold text-xs uppercase tracking-wider cursor-pointer transition-all"
        >
          Cancel Matchmaking
        </button>
      </div>
    );
  }

  // ================= RENDER: 3-2-1 COUNTDOWN =================
  if (phase === 'COUNTDOWN') {
    return (
      <div className="w-full h-full min-h-screen bg-zinc-950 text-white flex flex-col justify-center items-center p-6 select-none font-sans">
        <div className="max-w-md w-full flex flex-col items-center text-center">
          {/* Versus Header with Student Banners */}
          <div className="flex items-center justify-between w-full mb-12">
            <div className="flex flex-col items-center gap-1.5">
              <div className="w-16 h-16 rounded-2xl bg-indigo-600 flex items-center justify-center text-2xl font-black border-2 border-indigo-400 shadow-lg shadow-indigo-600/30">
                {myAvatar}
              </div>
              <span className="text-xs font-bold text-zinc-300 truncate max-w-[110px]">{myName}</span>
              <span className="text-[10px] text-indigo-400 font-medium px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20">
                AP Scholar
              </span>
            </div>

            <div className="flex flex-col items-center">
              <span className="text-2xl font-black text-rose-500 italic">VS</span>
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-1">
                {activeSubject.name}
              </span>
            </div>

            <div className="flex flex-col items-center gap-1.5">
              <div className="w-16 h-16 rounded-2xl bg-rose-600 flex items-center justify-center text-2xl font-black border-2 border-rose-400 shadow-lg shadow-rose-600/30">
                {getOpponentAvatar()}
              </div>
              <span className="text-xs font-bold text-zinc-300 truncate max-w-[110px]">{opponent?.name || 'Rival'}</span>
              <span className="text-[10px] text-rose-300 font-medium px-2 py-0.5 rounded-full bg-rose-500/10 border border-rose-500/20 truncate max-w-[130px]">
                {getOpponentTagline()}
              </span>
            </div>
          </div>

          <motion.div
            key={countdownNum}
            initial={{ scale: 0.3, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 1.5, opacity: 0 }}
            className="text-8xl font-black text-white tracking-tighter my-6"
          >
            {countdownNum}
          </motion.div>

          <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest animate-pulse">
            Match Starting...
          </span>
        </div>
      </div>
    );
  }

  // ================= RENDER: BATTLE ARENA =================
  if (phase === 'BATTLE') {
    return (
      <div className="w-full h-full min-h-screen bg-zinc-950 text-white flex flex-col justify-between p-5 select-none font-sans overflow-y-auto">
        {/* Top Header: Scores & Timer */}
        <div className="max-w-md w-full mx-auto flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <button
              onClick={() => {
                cleanupAllBattleState();
                triggerVibration(15);
                setPhase('LOBBY');
              }}
              className="w-9 h-9 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>

            {/* Countdown Timer */}
            <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 px-4 py-1.5 rounded-full">
              <Clock className={`w-3.5 h-3.5 ${timeLeft <= 5 ? 'text-rose-400 animate-spin' : 'text-amber-400'}`} />
              <span className={`text-sm font-mono font-black ${timeLeft <= 5 ? 'text-rose-400' : 'text-white'}`}>
                {timeLeft}s
              </span>
            </div>

            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className="w-9 h-9 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white cursor-pointer"
            >
              {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-zinc-600" />}
            </button>
          </div>

          {/* Versus Scoreboard */}
          <div className="grid grid-cols-2 gap-3 bg-zinc-900/90 border border-zinc-800/90 rounded-2xl p-3">
            {/* User Side */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center font-bold text-white text-base">
                {myAvatar}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[11px] font-semibold text-zinc-400 truncate">You</span>
                <span className="text-xl font-black text-white">{userScore} <span className="text-[10px] text-zinc-500 font-normal">pts</span></span>
              </div>
            </div>

            {/* Opponent Side */}
            <div className="flex items-center justify-end gap-3 text-right">
              <div className="flex flex-col min-w-0">
                <div className="flex items-center justify-end gap-1.5">
                  <span className="text-[11px] font-semibold text-zinc-300 truncate max-w-[100px]">{opponent?.name || 'Rival'}</span>
                  {opponentAnswerStatus === 'answered' ? (
                    <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block shrink-0" title="Locked in" />
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse inline-block shrink-0" title="Thinking" />
                  )}
                </div>
                <div className="flex items-center justify-end gap-1">
                  <span className="text-xl font-black text-white">{opponentScore} <span className="text-[10px] text-zinc-500 font-normal">pts</span></span>
                </div>
                <span className="text-[9px] text-rose-400 font-medium truncate max-w-[120px]">
                  {getOpponentTagline()}
                </span>
              </div>
              <div className="w-10 h-10 rounded-xl bg-rose-600 flex items-center justify-center font-bold text-white text-base shrink-0 border border-rose-400/30">
                {getOpponentAvatar()}
              </div>
            </div>
          </div>
        </div>

        {/* Question Content */}
        <div className="max-w-md w-full mx-auto my-auto flex flex-col gap-4 py-2">
          {/* Question Tag */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider">
                {activeSubject.name}
              </span>
              {currentQ?.difficulty && (
                <span className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full border ${
                  currentQ.difficulty === 'Easy'
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : currentQ.difficulty === 'Medium'
                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                    : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                }`}>
                  {currentQ.difficulty} • {currentQ.timeLimit || 30}s
                </span>
              )}
            </div>
            <span className="text-[11px] font-mono text-zinc-500">
              Q{currentQIndex + 1} of {questions.length}
            </span>
          </div>

          {/* Question Text */}
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4 min-h-[100px] flex items-center max-w-full overflow-x-auto">
            <GlobalMarkdown
              className="w-full [&_.katex]:text-zinc-100 [&_p]:text-zinc-100 [&_p]:m-0 [&_p]:text-sm sm:[&_p]:text-base [&_p]:font-semibold [&_p]:leading-relaxed [&_.katex-display]:my-2 [&_.katex-display]:overflow-x-auto"
              components={{
                p: ({ node, ...props }: any) => (
                  <p className="text-sm sm:text-base font-semibold text-zinc-100 leading-relaxed m-0 break-words" {...props} />
                )
              }}
            >
              {prepareQuizMath(currentQ ? currentQ.stem : "Loading question...")}
            </GlobalMarkdown>
          </div>

          {/* Synchronized Round Status Banner */}
          <div className="w-full">
            {roundRevealed ? (
              <div className="flex items-center justify-center gap-2 py-2 px-4 rounded-xl bg-emerald-950/60 border border-emerald-500/30 text-emerald-300 text-xs font-semibold">
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>Round Complete! Preparing next question...</span>
              </div>
            ) : (userAnswerStatus === 'answered' && opponentAnswerStatus === 'answered') ? (
              <div className="flex items-center justify-center gap-2 py-2 px-4 rounded-xl bg-indigo-950/60 border border-indigo-500/30 text-indigo-300 text-xs font-semibold animate-pulse">
                <Check className="w-3.5 h-3.5 text-indigo-400" />
                <span>Both answers locked in! Revealing results...</span>
              </div>
            ) : userAnswerStatus === 'answered' ? (
              <div className="flex items-center justify-center gap-2 py-2 px-4 rounded-xl bg-violet-950/60 border border-violet-500/30 text-violet-300 text-xs font-semibold animate-pulse">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-400" />
                <span>Answer locked in! Waiting for opponent...</span>
              </div>
            ) : opponentAnswerStatus === 'answered' ? (
              <div className="flex items-center justify-center gap-2 py-2 px-4 rounded-xl bg-amber-950/40 border border-amber-500/30 text-amber-300 text-xs font-semibold">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span>Opponent locked in! Hurry up!</span>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2 py-2 px-4 rounded-xl bg-zinc-900/60 border border-zinc-800/80 text-zinc-400 text-xs font-medium">
                <Clock className="w-3.5 h-3.5 text-zinc-500" />
                <span>Select the correct answer before time runs out!</span>
              </div>
            )}
          </div>

          {/* Options */}
          <div className="grid grid-cols-1 gap-2.5">
            {currentQ?.options.map((optionText, idx) => {
              const isSelected = userSelectedOption === idx;
              const isCorrectAnswer = idx === currentQ.correctIndex;

              let btnStyle = 'bg-zinc-900/90 border-zinc-800 text-zinc-200 hover:border-zinc-700';

              if (roundRevealed) {
                if (isCorrectAnswer) {
                  btnStyle = 'bg-emerald-950/80 border-emerald-500 text-emerald-100 shadow-md shadow-emerald-900/30 font-bold';
                } else if (isSelected && !isCorrectAnswer) {
                  btnStyle = 'bg-rose-950/80 border-rose-500 text-rose-200';
                } else {
                  btnStyle = 'bg-zinc-900/40 border-zinc-900 text-zinc-500 opacity-60';
                }
              } else if (isSelected) {
                btnStyle = 'bg-indigo-950/80 border-indigo-500 text-indigo-100 font-bold';
              }

              return (
                <button
                  key={idx}
                  disabled={userAnswerStatus === 'answered' || roundRevealed}
                  onClick={() => handleSelectOption(idx)}
                  className={`w-full text-left p-3.5 rounded-xl border text-xs sm:text-sm font-medium transition-all cursor-pointer flex items-center justify-between overflow-hidden ${btnStyle} ${
                    userAnswerStatus === 'answered' || roundRevealed ? 'cursor-default' : 'active:scale-[0.99]'
                  }`}
                >
                  <div className="flex items-center gap-3 w-full min-w-0">
                    <span className="w-6 h-6 rounded-lg bg-zinc-800/80 border border-zinc-700/60 flex items-center justify-center text-[11px] font-bold text-zinc-300 shrink-0">
                      {String.fromCharCode(65 + idx)}
                    </span>
                    <div className="leading-normal text-xs sm:text-sm font-medium text-left flex-1 min-w-0 overflow-x-auto overflow-y-hidden scrollbar-none [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden py-1">
                      <GlobalMarkdown
                        className="inline-block w-full [&_.katex]:text-inherit [&_p]:m-0 [&_p]:inline [&_p]:text-inherit text-xs sm:text-sm font-medium"
                        components={{
                          p: ({ node, ...props }: any) => <span className="inline break-words" {...props} />
                        }}
                      >
                        {prepareQuizMath(optionText)}
                      </GlobalMarkdown>
                    </div>
                  </div>

                  {roundRevealed && isCorrectAnswer && (
                    <Check className="w-4 h-4 text-emerald-400 shrink-0 ml-2" />
                  )}
                </button>
              );
            })}
          </div>


        </div>

        {/* Bottom Pacing Indicator */}
        <div className="max-w-md w-full mx-auto flex items-center justify-center gap-1.5 py-1">
          {questions.map((_, i) => (
            <div
              key={i}
              className={`h-1 rounded-full transition-all ${
                i === currentQIndex 
                  ? 'w-6 bg-indigo-500' 
                  : i < currentQIndex 
                  ? 'w-3 bg-zinc-600' 
                  : 'w-3 bg-zinc-800'
              }`}
            />
          ))}
        </div>
      </div>
    );
  }

  // ================= RENDER: VICTORY SCREEN =================
  const isUserWinner = userScore > opponentScore;
  const isTie = userScore === opponentScore;

  return (
    <div className="w-full h-full min-h-screen bg-zinc-950 text-white flex flex-col justify-between p-6 select-none font-sans overflow-y-auto">
      <div className="flex items-center justify-between max-w-md w-full mx-auto">
        <button
          onClick={() => {
            cleanupAllBattleState();
            triggerVibration(15);
            onBack();
          }}
          className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-300 hover:text-white cursor-pointer"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest">
          Match Finished
        </span>

        <div className="w-10"></div>
      </div>

      <div className="max-w-md w-full mx-auto my-auto flex flex-col items-center text-center py-4">
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 20 }}
          className={`w-24 h-24 rounded-3xl flex items-center justify-center mb-4 shadow-2xl ${
            isUserWinner
              ? 'bg-gradient-to-tr from-amber-500 to-yellow-400 text-zinc-950 shadow-amber-500/30'
              : isTie
              ? 'bg-gradient-to-tr from-indigo-500 to-purple-500 text-white shadow-indigo-500/30'
              : 'bg-gradient-to-tr from-zinc-800 to-zinc-700 text-zinc-400'
          }`}
        >
          {isUserWinner ? (
            <Trophy className="w-12 h-12 text-zinc-950" />
          ) : isTie ? (
            <Award className="w-12 h-12 text-white" />
          ) : (
            <Target className="w-12 h-12 text-zinc-400" />
          )}
        </motion.div>

        <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white mb-1">
          {isUserWinner ? 'VICTORY!' : isTie ? 'DRAW MATCH!' : 'GOOD EFFORT!'}
        </h1>
        <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-6">
          {isUserWinner
            ? `Congratulations! You conquered ${activeSubject.name} Duel`
            : isTie
            ? `Evenly Matched! ${activeSubject.name} Duel`
            : `Keep practicing! ${activeSubject.name} Duel`}
        </span>

        {/* Score Box with Profile Banners */}
        <div className="w-full bg-zinc-900/90 border border-zinc-800 rounded-3xl p-5 mb-6 flex items-center justify-around">
          {/* User Side */}
          <div className="flex flex-col items-center gap-1">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center font-bold text-white text-base border border-indigo-400/30 mb-0.5">
              {myAvatar}
            </div>
            <span className="text-[11px] font-bold text-indigo-400 uppercase truncate max-w-[110px]">
              You ({myName})
            </span>
            <span className="text-3xl font-black text-white">{userScore}</span>
            <span className="text-[10px] text-zinc-400">pts</span>
          </div>

          <div className="text-zinc-600 font-black text-xl">VS</div>

          {/* Opponent Side with Banner */}
          <div className="flex flex-col items-center gap-1">
            <div className="w-10 h-10 rounded-xl bg-rose-600 flex items-center justify-center font-bold text-white text-base border border-rose-400/30 mb-0.5">
              {getOpponentAvatar()}
            </div>
            <span className="text-[11px] font-bold text-rose-400 uppercase truncate max-w-[110px]">
              {opponent?.name || 'Rival'}
            </span>
            <span className="text-3xl font-black text-white">{opponentScore}</span>
            <span className="text-[10px] text-zinc-400">pts</span>
            <span className="text-[9px] text-zinc-400 font-medium px-2 py-0.5 rounded-full bg-zinc-800/80 border border-zinc-700/60 truncate max-w-[110px] mt-0.5">
              {getOpponentTagline()}
            </span>
          </div>
        </div>

        {/* Rewards Earned */}
        <div className="inline-flex items-center gap-4 bg-zinc-900 border border-zinc-800 px-5 py-3 rounded-2xl mb-6 shadow-md">
          <div className="flex items-center gap-1.5 text-xs font-black text-amber-400">
            <Award className="w-4 h-4" />
            <span>+{isUserWinner ? 25 : 10} Study Coins</span>
          </div>
          <div className="h-3 w-px bg-zinc-700"></div>
          <div className="flex items-center gap-1.5 text-xs font-black text-indigo-400">
            <Zap className="w-4 h-4" />
            <span>+{isUserWinner ? 150 : 60} XP</span>
          </div>
        </div>
      </div>

      <div className="max-w-md w-full mx-auto flex flex-col gap-3">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={startQuickMatch}
          className="w-full py-4 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-extrabold text-xs uppercase tracking-wider shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 cursor-pointer transition-all"
        >
          <RotateCcw className="w-4 h-4" />
          <span>Play Again (Rematch)</span>
        </motion.button>

        <button
          onClick={() => {
            cleanupAllBattleState();
            triggerVibration(10);
            setPhase('LOBBY');
          }}
          className="w-full py-3.5 rounded-2xl bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white font-bold text-xs uppercase tracking-wider cursor-pointer transition-colors"
        >
          Return to Lobby
        </button>
      </div>
    </div>
  );
};

export default APQuizBattle;

```

---

## 2. Real-Time Sync Engine (`battleSync.ts`)
**File Path**: `src/services/battleSync.ts`
- Quick Match queue entry & polling (every 350ms heartbeat).
- Friend room creation and code joining.
- Subscriptions to room updates, synchronized answers, and forfeit handling.

```ts
import { getApiUrl } from '../utils/api';
import { BattleQuestion } from '../data/quizBattleBank';

export interface PlayerProfile {
  id: string;
  name: string;
  avatar: string;
  isRealPlayer: boolean;
  score: number;
  hasAnswered: boolean;
  currentQ: number;
  finished?: boolean;
}

export interface BattleRoom {
  id: string;
  code?: string;
  subjectId: string;
  status: 'waiting' | 'countdown' | 'battle' | 'finished';
  player1: PlayerProfile;
  player2: PlayerProfile | null;
  questions: BattleQuestion[];
  currentQ: number;
  roundStatus: 'playing' | 'revealed';
  roundStartTime: number;
  revealStartTime?: number;
  countdownStart?: number;
  updatedAt: number;
}

export class BattleSyncService {
  /**
   * 1. Try to find a match or enter queue on the live server
   */
  async enterMatchQueue(
    playerId: string,
    playerName: string,
    playerAvatar: string,
    subjectId: string,
    questions: BattleQuestion[]
  ): Promise<{ status: 'matched' | 'waiting'; roomId?: string; isPlayer1?: boolean; opponent?: PlayerProfile; questions?: BattleQuestion[]; subjectId?: string }> {
    try {
      const res = await fetch(getApiUrl('/api/battle/match'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId,
          playerName,
          playerAvatar,
          subjectId,
          questions
        })
      });

      if (!res.ok) {
        throw new Error(`Matchmaking HTTP error ${res.status}`);
      }

      return await res.json();
    } catch (err) {
      console.warn('Live server match request failed:', err);
      return { status: 'waiting' };
    }
  }

  /**
   * 2. Start polling for an opponent while active on radar screen (every 350ms)
   */
  startQueuePolling(
    playerId: string,
    onMatched: (roomId: string, opponent: PlayerProfile, questions: BattleQuestion[], isPlayer1: boolean, subjectId?: string) => void
  ): () => void {
    let active = true;

    const poll = async () => {
      if (!active) return;
      try {
        const res = await fetch(getApiUrl('/api/battle/poll-match'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playerId })
        });

        if (res.ok) {
          const data = await res.json();
          if (data.status === 'matched' && data.roomId && data.opponent) {
            active = false;
            const opp: PlayerProfile = {
              id: data.opponent.id,
              name: data.opponent.name,
              avatar: data.opponent.avatar,
              isRealPlayer: true,
              score: data.opponent.score || 0,
              hasAnswered: !!data.opponent.hasAnswered,
              currentQ: data.opponent.currentQ || 0
            };
            onMatched(data.roomId, opp, data.questions || [], !!data.isPlayer1, data.subjectId);
            return;
          }
        }
      } catch (err) {
        console.warn('Queue poll error:', err);
      }

      if (active) {
        setTimeout(poll, 350);
      }
    };

    setTimeout(poll, 250);

    return () => {
      active = false;
    };
  }

  /**
   * 3. Cleanly leave the queue / cancel matchmaking
   */
  async leaveQueue(playerId: string, roomId?: string): Promise<void> {
    try {
      await fetch(getApiUrl('/api/battle/cancel'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId, roomId })
      });
    } catch {}
  }

  /**
   * 4. Create a private room with 6-digit Code
   */
  async createFriendRoom(
    code: string,
    player: PlayerProfile,
    subjectId: string,
    questions: BattleQuestion[]
  ): Promise<{ success: boolean; roomId?: string }> {
    try {
      const res = await fetch(getApiUrl('/api/battle/room/create'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomCode: code,
          player,
          subjectId,
          questions
        })
      });

      if (!res.ok) return { success: false };
      const data = await res.json();
      return { success: true, roomId: data.roomId };
    } catch (err) {
      console.warn('Create friend room failed:', err);
      return { success: false };
    }
  }

  /**
   * 5. Join a private room with 6-digit Code
   */
  async joinFriendRoom(
    code: string,
    player: PlayerProfile
  ): Promise<{ success: boolean; roomId?: string; opponent?: PlayerProfile; questions?: BattleQuestion[]; subjectId?: string }> {
    try {
      const res = await fetch(getApiUrl('/api/battle/room/join'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomCode: code,
          player
        })
      });

      if (!res.ok) return { success: false };
      const data = await res.json();
      const opp: PlayerProfile = {
        id: data.opponent.id,
        name: data.opponent.name,
        avatar: data.opponent.avatar,
        isRealPlayer: true,
        score: data.opponent.score || 0,
        hasAnswered: !!data.opponent.hasAnswered,
        currentQ: data.opponent.currentQ || 0
      };

      return {
        success: true,
        roomId: data.roomId,
        opponent: opp,
        questions: data.questions,
        subjectId: data.subjectId || data.room?.subjectId
      };
    } catch (err) {
      console.warn('Join friend room failed:', err);
      return { success: false };
    }
  }

  /**
   * 6. Sync player action in room (Score, Answered state, Finished state)
   */
  async updatePlayerAction(
    roomId: string,
    playerId: string,
    score: number,
    hasAnswered: boolean,
    finished: boolean = false
  ): Promise<void> {
    try {
      await fetch(getApiUrl('/api/battle/action'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId,
          playerId,
          score,
          hasAnswered,
          finished
        })
      });
    } catch (err) {
      console.warn('Sync player action error:', err);
    }
  }

  /**
   * 7. Poll room status during battle (every 350ms)
   */
  subscribeToRoomUpdates(
    roomId: string,
    myPlayerId: string,
    onRoomUpdate: (room: BattleRoom, opponent: PlayerProfile | null) => void
  ): () => void {
    let active = true;

    const poll = async () => {
      if (!active) return;
      try {
        const res = await fetch(getApiUrl(`/api/battle/room/${roomId}`));
        if (res.ok) {
          const data = await res.json();
          const room: BattleRoom = data.room;
          if (room) {
            const oppRaw = room.player1.id === myPlayerId ? room.player2 : room.player1;
            const opp: PlayerProfile | null = oppRaw ? {
              id: oppRaw.id,
              name: oppRaw.name,
              avatar: oppRaw.avatar,
              isRealPlayer: true,
              score: oppRaw.score || 0,
              hasAnswered: !!oppRaw.hasAnswered,
              currentQ: oppRaw.currentQ || 0
            } : null;

            onRoomUpdate(room, opp);
          }
        }
      } catch {}

      if (active) {
        setTimeout(poll, 350);
      }
    };

    setTimeout(poll, 150);

    return () => {
      active = false;
    };
  }
}

export const battleSync = new BattleSyncService();

```

---

## 3. Synthesized Audio Engine (`quizBattleAudio.ts`)
**File Path**: `src/utils/quizBattleAudio.ts`
- Zero external MP3 asset dependency. Uses browser Web Audio API oscillator synthesis for low-latency sound effects on mobile & web:
  - Victory Fanfare
  - Wrong Answer Buzz
  - Correct Answer Ding
  - Battle Start Horn
  - Urgent Countdown Tick
  - Opponent Action Chime

```ts
// Ultra-lightweight zero-asset Web Audio Synthesizer for Quiz Battle SFX

class SoundFX {
  private ctx: AudioContext | null = null;

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  // Dramatic match start gong / riser
  playBattleStart() {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc2.type = 'triangle';
      osc1.frequency.setValueAtTime(220, now);
      osc1.frequency.exponentialRampToValueAtTime(587.33, now + 0.35);

      osc2.frequency.setValueAtTime(110, now);
      osc2.frequency.exponentialRampToValueAtTime(293.66, now + 0.35);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.5);
      osc2.stop(now + 0.5);
    } catch {}
  }

  // Subtle clock tick
  playTick() {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, now);
      gain.gain.setValueAtTime(0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.04);
    } catch {}
  }

  // Urgent double-tick for final 5 seconds
  playUrgentTick() {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'square';
      osc.frequency.setValueAtTime(980, now);
      gain.gain.setValueAtTime(0.07, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.06);
    } catch {}
  }

  // Bright chime for correct answer
  playCorrect() {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.06);

        gain.gain.setValueAtTime(0.18, now + idx * 0.06);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.06 + 0.25);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + idx * 0.06);
        osc.stop(now + idx * 0.06 + 0.25);
      });
    } catch {}
  }

  // Low dull buzzer for wrong answer
  playWrong() {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.linearRampToValueAtTime(100, now + 0.2);

      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.25);
    } catch {}
  }

  // Opponent locked in answer cue
  playOpponentAction() {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(330, now + 0.1);

      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.12);
    } catch {}
  }

  // Winner Fanfare: Triumphant rising brass notes (strictly single-shot)
  playVictory() {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const notes = [
        { freq: 523.25, time: 0, dur: 0.15 },
        { freq: 659.25, time: 0.14, dur: 0.15 },
        { freq: 783.99, time: 0.28, dur: 0.2 },
        { freq: 1046.5, time: 0.48, dur: 0.55 },
      ];

      notes.forEach((note) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(note.freq, now + note.time);

        gain.gain.setValueAtTime(0.22, now + note.time);
        gain.gain.exponentialRampToValueAtTime(0.001, now + note.time + note.dur);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + note.time);
        osc.stop(now + note.time + note.dur);
      });
    } catch {}
  }

  // Loser Sound: Distinct game-over loss theme with descending minor progression (strictly single-shot)
  playDefeat() {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      // Classic descending defeat motif: G4 -> F4 -> Eb4 -> low C4 with gentle pitch slide
      const notes = [
        { freq: 392.00, time: 0, dur: 0.18 },
        { freq: 349.23, time: 0.18, dur: 0.18 },
        { freq: 311.13, time: 0.36, dur: 0.22 },
        { freq: 246.94, time: 0.58, dur: 0.55 },
      ];

      notes.forEach((note) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(note.freq, now + note.time);
        if (note.time >= 0.58) {
          // Classic downward decay slide on final note
          osc.frequency.exponentialRampToValueAtTime(220, now + note.time + note.dur);
        }

        gain.gain.setValueAtTime(0.22, now + note.time);
        gain.gain.exponentialRampToValueAtTime(0.001, now + note.time + note.dur);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + note.time);
        osc.stop(now + note.time + note.dur);
      });
    } catch {}
  }

  // Draw Match: Balanced neutral two-tone chime
  playDraw() {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const notes = [
        { freq: 440, time: 0, dur: 0.2 },
        { freq: 554.37, time: 0.2, dur: 0.35 },
      ];

      notes.forEach((note) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(note.freq, now + note.time);

        gain.gain.setValueAtTime(0.18, now + note.time);
        gain.gain.exponentialRampToValueAtTime(0.001, now + note.time + note.dur);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + note.time);
        osc.stop(now + note.time + note.dur);
      });
    } catch {}
  }
}

export const battleAudio = new SoundFX();

```

---

## 4. Question Bank & Subjects Data (`quizBattleBank.ts`)
**File Path**: `src/data/quizBattleBank.ts`
- All 15 AP Subjects with curated questions, KaTeX formulas, 4 options, explanations, dynamic time limits (30s/45s/60s), and Ghost bot practice rivals.

```ts
export interface BattleQuestion {
  id: string;
  subjectId: string;
  stem: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  difficulty?: 'Easy' | 'Medium' | 'Hard';
  timeLimit: number; // 30s (Easy), 45s (Medium), 60s (Hard)
}

export interface GhostPlayer {
  id: string;
  name: string;
  avatar: string;
  rating: number;
  level: number;
  apScoreTarget: number;
  tagline: string;
  timings: number[];
  accuracy: boolean[];
}

export const AP_BATTLE_SUBJECTS = [
  { id: 'ap-calculus-ab', name: 'AP Calculus AB', icon: '📐', color: 'from-blue-600 to-indigo-700' },
  { id: 'ap-calculus-bc', name: 'AP Calculus BC', icon: '∫', color: 'from-indigo-600 to-purple-700' },
  { id: 'ap-physics', name: 'AP Physics 1', icon: '⚡', color: 'from-amber-600 to-orange-700' },
  { id: 'ap-chemistry', name: 'AP Chemistry', icon: '⚗️', color: 'from-purple-600 to-violet-700' },
  { id: 'ap-biology', name: 'AP Biology', icon: '🧬', color: 'from-emerald-600 to-teal-700' },
  { id: 'ap-environmental-science', name: 'AP Environmental Science', icon: '🌱', color: 'from-green-600 to-emerald-700' },
  { id: 'ap-computer-science-principles', name: 'AP Computer Science Principles', icon: '💻', color: 'from-cyan-600 to-blue-700' },
  { id: 'ap-computer-science', name: 'AP Computer Science A (Java)', icon: '☕', color: 'from-blue-700 to-slate-800' },
  { id: 'ap-us-history', name: 'AP U.S. History (APUSH)', icon: '📜', color: 'from-rose-600 to-red-700' },
  { id: 'ap-world-history', name: 'AP World History: Modern', icon: '🌍', color: 'from-orange-600 to-amber-700' },
  { id: 'ap-human-geography', name: 'AP Human Geography', icon: '🗺️', color: 'from-sky-600 to-teal-700' },
  { id: 'ap-psychology', name: 'AP Psychology', icon: '🧠', color: 'from-pink-600 to-rose-700' },
  { id: 'ap-economics', name: 'AP Micro & Macroeconomics', icon: '📊', color: 'from-emerald-700 to-teal-800' },
  { id: 'ap-english-lang', name: 'AP English Language', icon: '✍️', color: 'from-violet-600 to-purple-800' },
];

export const GHOST_PROFILES: GhostPlayer[] = [
  {
    id: 'ghost_rohan',
    name: 'Rohan M.',
    avatar: 'R',
    rating: 1540,
    level: 7,
    apScoreTarget: 5,
    tagline: 'MIT Aspirant - Level 7',
    timings: [6500, 8800, 7100, 9200, 7300],
    accuracy: [true, false, true, false, false]
  },
  {
    id: 'ghost_sophia',
    name: 'Sophia Chen',
    avatar: 'S',
    rating: 1610,
    level: 9,
    apScoreTarget: 5,
    tagline: 'Stanford Early Action - AP Scholar',
    timings: [5800, 7900, 6200, 8500, 6800],
    accuracy: [false, true, false, true, false]
  },
  {
    id: 'ghost_marcus',
    name: 'Marcus Vance',
    avatar: 'M',
    rating: 1480,
    level: 6,
    apScoreTarget: 4,
    tagline: 'Physics & Calc Grind - Level 6',
    timings: [7200, 9100, 8800, 10900, 7400],
    accuracy: [true, false, false, false, true]
  },
  {
    id: 'ghost_aanya',
    name: 'Aanya Patel',
    avatar: 'A',
    rating: 1590,
    level: 8,
    apScoreTarget: 5,
    tagline: 'AP Scholar with Distinction',
    timings: [6100, 8300, 7600, 9900, 7000],
    accuracy: [false, false, true, false, false]
  },
  {
    id: 'ghost_ethan',
    name: 'Ethan Brooks',
    avatar: 'E',
    rating: 1420,
    level: 5,
    apScoreTarget: 4,
    tagline: 'Speedrunner - Level 5 Scholar',
    timings: [5500, 6200, 5900, 7800, 6100],
    accuracy: [false, false, false, true, false]
  },
  {
    id: 'ghost_priya',
    name: 'Priya Nair',
    avatar: 'P',
    rating: 1640,
    level: 9,
    apScoreTarget: 5,
    tagline: 'National Merit Finalist',
    timings: [6300, 7100, 6500, 8400, 6900],
    accuracy: [true, false, false, true, false]
  },
  {
    id: 'ghost_lucas',
    name: 'Lucas Rossi',
    avatar: 'L',
    rating: 1510,
    level: 7,
    apScoreTarget: 4,
    tagline: 'Cornell Hopeful - AP Scholar',
    timings: [6900, 8700, 7200, 9400, 7600],
    accuracy: [false, true, false, false, false]
  },
  {
    id: 'ghost_hannah',
    name: 'Hannah Kim',
    avatar: 'H',
    rating: 1670,
    level: 10,
    apScoreTarget: 5,
    tagline: 'Ivy League Bound - Top 10%',
    timings: [5900, 6700, 6100, 8200, 6600],
    accuracy: [false, false, false, false, true]
  }
];

export const BATTLE_QUESTIONS_BANK: Record<string, BattleQuestion[]> = {
  "ap-calculus-ab": [
    {
      "id": "calc_1",
      "subjectId": "ap-calculus-ab",
      "stem": "If $f(x) = x^3 - 3x^2 + 4$, at which $x$-value does $f$ have a relative minimum?",
      "options": [
        "$x = 0$",
        "$x = 1$",
        "$x = 2$",
        "$x = -2$"
      ],
      "correctIndex": 2,
      "explanation": "$f'(x) = 3x^2 - 6x = 3x(x - 2) = 0$. $f''(2) = 6 > 0$, so $x = 2$ is a relative minimum.",
      "difficulty": "Easy",
      "timeLimit": 30
    },
    {
      "id": "calc_2",
      "subjectId": "ap-calculus-ab",
      "stem": "Evaluate $\\lim_{x \\to 0} \\frac{\\sin(5x)}{2x}$.",
      "options": [
        "$\\frac{1}{2}$",
        "$\\frac{5}{2}$",
        "$0$",
        "Does not exist"
      ],
      "correctIndex": 1,
      "explanation": "Using L'Hopital's rule or standard trigonometric limits: $\\lim_{x \\to 0} \\frac{\\sin(5x)}{2x} = \\frac{5}{2} \\lim_{x \\to 0} \\frac{\\sin(5x)}{5x} = \\frac{5}{2} \\times 1 = \\frac{5}{2}$.",
      "difficulty": "Easy",
      "timeLimit": 30
    },
    {
      "id": "calc_3",
      "subjectId": "ap-calculus-ab",
      "stem": "What is $\\frac{d}{dx} \\left[ \\ln(x^2 + 1) \\right]$?",
      "options": [
        "$\\frac{1}{x^2 + 1}$",
        "$\\frac{2x}{x^2 + 1}$",
        "$\\frac{2}{x}$",
        "$\\frac{x}{x^2 + 1}$"
      ],
      "correctIndex": 1,
      "explanation": "By the chain rule: $\\frac{d}{dx}[\\ln(u)] = \\frac{u'}{u} = \\frac{2x}{x^2 + 1}$.",
      "difficulty": "Easy",
      "timeLimit": 30
    },
    {
      "id": "calc_4",
      "subjectId": "ap-calculus-ab",
      "stem": "Evaluate the definite integral $\\int_0^3 (2x + 1) dx$.",
      "options": [
        "$10$",
        "$12$",
        "$15$",
        "$9$"
      ],
      "correctIndex": 1,
      "explanation": "$\\int_0^3 (2x + 1) dx = [x^2 + x]_0^3 = (9 + 3) - 0 = 12$.",
      "difficulty": "Easy",
      "timeLimit": 30
    },
    {
      "id": "calc_5",
      "subjectId": "ap-calculus-ab",
      "stem": "If $y = e^{3x}$, find the second derivative $\\frac{d^2y}{dx^2}$.",
      "options": [
        "$3e^{3x}$",
        "$6e^{3x}$",
        "$9e^{3x}$",
        "$27e^{3x}$"
      ],
      "correctIndex": 2,
      "explanation": "$y' = 3e^{3x}$, and $y'' = 3 \\cdot 3e^{3x} = 9e^{3x}$.",
      "difficulty": "Easy",
      "timeLimit": 30
    },
    {
      "id": "calc_6",
      "subjectId": "ap-calculus-ab",
      "stem": "What is the slope of the tangent line to $y = \\cos(2x)$ at $x = \\frac{\\pi}{4}$?",
      "options": [
        "$-2$",
        "$0$",
        "$2$",
        "$-1$"
      ],
      "correctIndex": 0,
      "explanation": "$y' = -2\\sin(2x)$. At $x = \\pi/4$, $y' = -2\\sin(\\pi/2) = -2(1) = -2$.",
      "difficulty": "Medium",
      "timeLimit": 45
    },
    {
      "id": "calc_7",
      "subjectId": "ap-calculus-ab",
      "stem": "If $\\int_1^5 f(x) dx = 10$ and $\\int_1^3 f(x) dx = 4$, what is $\\int_3^5 f(x) dx$?",
      "options": [
        "$6$",
        "$14$",
        "$-6$",
        "$2.5$"
      ],
      "correctIndex": 0,
      "explanation": "$\\int_3^5 f(x) dx = \\int_1^5 f(x) dx - \\int_1^3 f(x) dx = 10 - 4 = 6$.",
      "difficulty": "Medium",
      "timeLimit": 45
    },
    {
      "id": "calc_8",
      "subjectId": "ap-calculus-ab",
      "stem": "Find the derivative of $f(x) = x \\cdot e^x$.",
      "options": [
        "$e^x$",
        "$x e^x$",
        "$e^x(x + 1)$",
        "$2x e^x$"
      ],
      "correctIndex": 2,
      "explanation": "Using product rule: $f'(x) = (1)(e^x) + (x)(e^x) = e^x(x + 1)$.",
      "difficulty": "Medium",
      "timeLimit": 45
    },
    {
      "id": "calc_9",
      "subjectId": "ap-calculus-ab",
      "stem": "If $g(x) = \\int_0^x (t^2 - 9) dt$, at which $x > 0$ does $g$ have a relative minimum?",
      "options": [
        "$x = 0$",
        "$x = 3$",
        "$x = 9$",
        "$x = \\sqrt{3}$"
      ],
      "correctIndex": 1,
      "explanation": "By FTC 1, $g'(x) = x^2 - 9$. For $x > 0$, $g'(x) = 0 \\implies x = 3$. $g'(x)$ changes from negative to positive at $x = 3$.",
      "difficulty": "Medium",
      "timeLimit": 45
    },
    {
      "id": "calc_10",
      "subjectId": "ap-calculus-ab",
      "stem": "Evaluate $\\int \\frac{1}{2x + 5} dx$.",
      "options": [
        "$\\ln|2x + 5| + C$",
        "$\\frac{1}{2} \\ln|2x + 5| + C$",
        "$2\\ln|2x + 5| + C$",
        "$\\frac{-1}{(2x+5)^2} + C$"
      ],
      "correctIndex": 1,
      "explanation": "Let $u = 2x + 5 \\implies du = 2 dx \\implies \\int \\frac{1}{u} \\frac{du}{2} = \\frac{1}{2} \\ln|2x + 5| + C$.",
      "difficulty": "Medium",
      "timeLimit": 45
    },
    {
      "id": "calc_11",
      "subjectId": "ap-calculus-ab",
      "stem": "What is the average value of $f(x) = 3x^2$ on the interval $[0, 2]$?",
      "options": [
        "$4$",
        "$6$",
        "$8$",
        "$12$"
      ],
      "correctIndex": 0,
      "explanation": "$f_{avg} = \\frac{1}{2 - 0} \\int_0^2 3x^2 dx = \\frac{1}{2} [x^3]_0^2 = \\frac{1}{2}(8) = 4$.",
      "difficulty": "Hard",
      "timeLimit": 60
    },
    {
      "id": "calc_12",
      "subjectId": "ap-calculus-ab",
      "stem": "If $f(x)$ is continuous on $[1, 5]$ and $f(1) = 2, f(5) = 10$, the IVT guarantees a value $c$ where $f(c) = $?",
      "options": [
        "$0$",
        "$7$",
        "$12$",
        "$-2$"
      ],
      "correctIndex": 1,
      "explanation": "By the Intermediate Value Theorem, $f(c)$ takes on every value between $2$ and $10$, including $7$.",
      "difficulty": "Hard",
      "timeLimit": 60
    },
    {
      "id": "calc_13",
      "subjectId": "ap-calculus-ab",
      "stem": "Find $\\lim_{x \\to \\infty} \\frac{4x^3 - 2x + 1}{7x^3 + 5x^2}$.",
      "options": [
        "$\\frac{4}{7}$",
        "$0$",
        "$\\infty$",
        "$\\frac{2}{5}$"
      ],
      "correctIndex": 0,
      "explanation": "Comparing leading coefficients of degree 3 terms: $\\lim_{x \\to \\infty} \\frac{4x^3}{7x^3} = \\frac{4}{7}$.",
      "difficulty": "Hard",
      "timeLimit": 60
    },
    {
      "id": "calc_14",
      "subjectId": "ap-calculus-ab",
      "stem": "What is $\\frac{d}{dx} [\\arctan(x)]$?",
      "options": [
        "$\\frac{1}{1 + x^2}$",
        "$\\frac{1}{\\sqrt{1 - x^2}}$",
        "$\\frac{-1}{1 + x^2}$",
        "$\\sec^2(x)$"
      ],
      "correctIndex": 0,
      "explanation": "The standard derivative of inverse tangent is $\\frac{d}{dx}[\\arctan(x)] = \\frac{1}{1 + x^2}$.",
      "difficulty": "Hard",
      "timeLimit": 60
    },
    {
      "id": "calc_15",
      "subjectId": "ap-calculus-ab",
      "stem": "If a particle position is $s(t) = t^3 - 6t^2 + 9t$, at what time $t > 0$ is its acceleration zero?",
      "options": [
        "$t = 1$",
        "$t = 2$",
        "$t = 3$",
        "$t = 4$"
      ],
      "correctIndex": 1,
      "explanation": "$v(t) = s'(t) = 3t^2 - 12t + 9$. $a(t) = v'(t) = 6t - 12 = 0 \\implies t = 2$.",
      "difficulty": "Hard",
      "timeLimit": 60
    }
  ],
  "ap-physics-1": [
    {
      "id": "phys_1",
      "subjectId": "ap-physics-1",
      "stem": "An object is dropped from rest from a cliff. Neglecting air resistance, what is its speed after $3.0\\text{ s}$? ($g = 9.8\\text{ m/s}^2$)",
      "options": [
        "$14.7\\text{ m/s}$",
        "$29.4\\text{ m/s}$",
        "$44.1\\text{ m/s}$",
        "$9.8\\text{ m/s}$"
      ],
      "correctIndex": 1,
      "explanation": "$v = v_0 + gt = 0 + (9.8)(3.0) = 29.4\\text{ m/s}$.",
      "difficulty": "Easy",
      "timeLimit": 30
    },
    {
      "id": "phys_2",
      "subjectId": "ap-physics-1",
      "stem": "A net external force $F$ acts on an object of mass $m$, giving it acceleration $a$. If the mass is doubled and force is halved, what is the new acceleration?",
      "options": [
        "$4a$",
        "$2a$",
        "$\\frac{a}{2}$",
        "$\\frac{a}{4}$"
      ],
      "correctIndex": 3,
      "explanation": "$a_{new} = \\frac{F/2}{2m} = \\frac{1}{4} \\frac{F}{m} = \\frac{a}{4}$.",
      "difficulty": "Easy",
      "timeLimit": 30
    },
    {
      "id": "phys_3",
      "subjectId": "ap-physics-1",
      "stem": "A car travels in a horizontal circle of radius $R$ at constant speed $v$. What force provides the centripetal acceleration?",
      "options": [
        "Centrifugal force",
        "Static friction between tires and road",
        "Gravitational force",
        "Normal force from the ground"
      ],
      "correctIndex": 1,
      "explanation": "Static friction between the car tires and the road surface prevents slipping and points towards the circle center.",
      "difficulty": "Easy",
      "timeLimit": 30
    },
    {
      "id": "phys_4",
      "subjectId": "ap-physics-1",
      "stem": "A $2\\text{ kg}$ cart moving at $3\\text{ m/s}$ collides and sticks to a stationary $1\\text{ kg}$ cart. What is their final common speed?",
      "options": [
        "$1.5\\text{ m/s}$",
        "$2.0\\text{ m/s}$",
        "$2.5\\text{ m/s}$",
        "$3.0\\text{ m/s}$"
      ],
      "correctIndex": 1,
      "explanation": "Conservation of momentum: $p_i = (2)(3) + 0 = 6\\text{ kg}\\cdot\\text{m/s}$. $v_f = \\frac{6}{2 + 1} = 2.0\\text{ m/s}$.",
      "difficulty": "Easy",
      "timeLimit": 30
    },
    {
      "id": "phys_5",
      "subjectId": "ap-physics-1",
      "stem": "A simple pendulum has period $T$ on Earth. If the length of the string is quadrupled ($4L$), what is the new period?",
      "options": [
        "$4T$",
        "$2T$",
        "$\\frac{T}{2}$",
        "$\\sqrt{2}T$"
      ],
      "correctIndex": 1,
      "explanation": "$T = 2\\pi\\sqrt{\\frac{L}{g}}$. Replacing $L$ with $4L$ gives $T_{new} = 2\\pi\\sqrt{\\frac{4L}{g}} = 2 T$.",
      "difficulty": "Easy",
      "timeLimit": 30
    },
    {
      "id": "phys_6",
      "subjectId": "ap-physics-1",
      "stem": "How much work is done by the gravitational force on a $5\\text{ kg}$ satellite in a circular orbit of radius $R$ during one full revolution?",
      "options": [
        "$0\\text{ J}$",
        "$5\\pi R\\text{ J}$",
        "$10g R\\text{ J}$",
        "$50\\text{ J}$"
      ],
      "correctIndex": 0,
      "explanation": "Gravity is perpendicular to the displacement vector at every point in a circular orbit ($W = F d \\cos(90^\\circ) = 0\\text{ J}$).",
      "difficulty": "Medium",
      "timeLimit": 45
    },
    {
      "id": "phys_7",
      "subjectId": "ap-physics-1",
      "stem": "A spring with spring constant $k = 200\\text{ N/m}$ is compressed by $0.1\\text{ m}$. What is the stored elastic potential energy?",
      "options": [
        "$1.0\\text{ J}$",
        "$2.0\\text{ J}$",
        "$10\\text{ J}$",
        "$20\\text{ J}$"
      ],
      "correctIndex": 0,
      "explanation": "$U_s = \\frac{1}{2} k x^2 = \\frac{1}{2} (200) (0.1)^2 = 100 \\times 0.01 = 1.0\\text{ J}$.",
      "difficulty": "Medium",
      "timeLimit": 45
    },
    {
      "id": "phys_8",
      "subjectId": "ap-physics-1",
      "stem": "A solid disk and a hollow ring of identical mass and radius roll down an incline without slipping. Which reaches the bottom first?",
      "options": [
        "The hollow ring",
        "The solid disk",
        "Both at the same time",
        "Depends on the incline angle"
      ],
      "correctIndex": 1,
      "explanation": "The solid disk has a smaller rotational inertia ($I = \\frac{1}{2}MR^2 < MR^2$), converting more PE into translational KE, so it accelerates faster.",
      "difficulty": "Medium",
      "timeLimit": 45
    },
    {
      "id": "phys_9",
      "subjectId": "ap-physics-1",
      "stem": "An elevator is accelerating upwards at $2\\text{ m/s}^2$. What apparent weight does an $80\\text{ kg}$ passenger feel? ($g = 10\\text{ m/s}^2$)",
      "options": [
        "$640\\text{ N}$",
        "$800\\text{ N}$",
        "$960\\text{ N}$",
        "$160\\text{ N}$"
      ],
      "correctIndex": 2,
      "explanation": "$N - mg = ma \\implies N = m(g + a) = 80(10 + 2) = 960\\text{ N}$.",
      "difficulty": "Medium",
      "timeLimit": 45
    },
    {
      "id": "phys_10",
      "subjectId": "ap-physics-1",
      "stem": "What happens to the total mechanical energy of a falling apple if air resistance is negligible?",
      "options": [
        "It increases",
        "It decreases",
        "It remains constant",
        "It oscillates"
      ],
      "correctIndex": 2,
      "explanation": "With only conservative gravitational forces doing work, total mechanical energy ($KE + PE$) remains strictly conserved.",
      "difficulty": "Medium",
      "timeLimit": 45
    },
    {
      "id": "phys_11",
      "subjectId": "ap-physics-1",
      "stem": "A net torque of $20\\text{ N}\\cdot\\text{m}$ acts on a wheel with moment of inertia $I = 4\\text{ kg}\\cdot\\text{m}^2$. What is the angular acceleration $\\alpha$?",
      "options": [
        "$5\\text{ rad/s}^2$",
        "$80\\text{ rad/s}^2$",
        "$0.2\\text{ rad/s}^2$",
        "$16\\text{ rad/s}^2$"
      ],
      "correctIndex": 0,
      "explanation": "$\\tau = I\\alpha \\implies \\alpha = \\frac{\\tau}{I} = \\frac{20}{4} = 5\\text{ rad/s}^2$.",
      "difficulty": "Hard",
      "timeLimit": 60
    },
    {
      "id": "phys_12",
      "subjectId": "ap-physics-1",
      "stem": "A projectile launched at angle $\\theta$ has maximum horizontal range when $\\theta$ equals:",
      "options": [
        "$30^\\circ$",
        "$45^\\circ$",
        "$60^\\circ$",
        "$90^\\circ$"
      ],
      "correctIndex": 1,
      "explanation": "Range $R = \\frac{v_0^2 \\sin(2\\theta)}{g}$, which reaches maximum when $\\sin(2\\theta) = 1 \\implies \\theta = 45^\\circ$.",
      "difficulty": "Hard",
      "timeLimit": 60
    },
    {
      "id": "phys_13",
      "subjectId": "ap-physics-1",
      "stem": "An astronaut floating in space throws a wrench forward. What happens to the astronaut?",
      "options": [
        "Moves forward faster",
        "Moves backward with equal momentum",
        "Remains stationary",
        "Spins continuously in place"
      ],
      "correctIndex": 1,
      "explanation": "By conservation of momentum ($p_{initial} = 0$), $p_{astronaut} = -p_{wrench}$, so the astronaut recoils backward.",
      "difficulty": "Hard",
      "timeLimit": 60
    },
    {
      "id": "phys_14",
      "subjectId": "ap-physics-1",
      "stem": "If the distance between two gravitational masses is doubled, the gravitational force between them is multiplied by:",
      "options": [
        "$2$",
        "$\\frac{1}{2}$",
        "$\\frac{1}{4}$",
        "$4$"
      ],
      "correctIndex": 2,
      "explanation": "Newton's law of universal gravitation follows an inverse-square law: $F \\propto \\frac{1}{r^2} \\implies \\frac{1}{2^2} = \\frac{1}{4}$.",
      "difficulty": "Hard",
      "timeLimit": 60
    },
    {
      "id": "phys_15",
      "subjectId": "ap-physics-1",
      "stem": "What physical quantity is represented by the area under a Force vs. Time graph?",
      "options": [
        "Work",
        "Kinetic Energy",
        "Impulse",
        "Power"
      ],
      "correctIndex": 2,
      "explanation": "Impulse $J = \\int F dt = \\Delta p$, which corresponds directly to the area under a Force-Time graph.",
      "difficulty": "Hard",
      "timeLimit": 60
    }
  ],
  "ap-biology": [
    {
      "id": "bio_1",
      "subjectId": "ap-biology",
      "stem": "Which organelle is responsible for generating the majority of cellular ATP via oxidative phosphorylation?",
      "options": [
        "Golgi Apparatus",
        "Mitochondria",
        "Endoplasmic Reticulum",
        "Lysosome"
      ],
      "correctIndex": 1,
      "explanation": "Mitochondria carry out the Krebs cycle and oxidative phosphorylation via the electron transport chain to produce ATP.",
      "difficulty": "Easy",
      "timeLimit": 30
    },
    {
      "id": "bio_2",
      "subjectId": "ap-biology",
      "stem": "What type of chemical bond holds the complementary base pairs (A-T and G-C) together in double-stranded DNA?",
      "options": [
        "Covalent phosphodiester bonds",
        "Hydrogen bonds",
        "Ionic bonds",
        "Disulfide bridges"
      ],
      "correctIndex": 1,
      "explanation": "Hydrogen bonds (2 between A-T, 3 between G-C) connect complementary nitrogenous bases across antiparallel strands.",
      "difficulty": "Easy",
      "timeLimit": 30
    },
    {
      "id": "bio_3",
      "subjectId": "ap-biology",
      "stem": "In a cross between two heterozygous pea plants ($Aa \\times Aa$), what is the expected phenotypic ratio of dominant to recessive traits?",
      "options": [
        "$1:1$",
        "$3:1$",
        "$9:3:3:1$",
        "$1:2:1$"
      ],
      "correctIndex": 1,
      "explanation": "The Punnett square yields $1 AA : 2 Aa : 1 aa$, resulting in a $3:1$ dominant to recessive phenotypic ratio.",
      "difficulty": "Easy",
      "timeLimit": 30
    },
    {
      "id": "bio_4",
      "subjectId": "ap-biology",
      "stem": "During which stage of aerobic cellular respiration is molecular oxygen ($O_2$) directly consumed?",
      "options": [
        "Glycolysis",
        "Krebs Cycle (Citric Acid Cycle)",
        "Electron Transport Chain",
        "Lactic Acid Fermentation"
      ],
      "correctIndex": 2,
      "explanation": "Oxygen acts as the terminal electron acceptor at complex IV of the mitochondrial electron transport chain, forming water ($H_2O$).",
      "difficulty": "Easy",
      "timeLimit": 30
    },
    {
      "id": "bio_5",
      "subjectId": "ap-biology",
      "stem": "Which enzyme unwinds the double helix at the replication fork during DNA replication?",
      "options": [
        "DNA Polymerase III",
        "Topoisomerase",
        "DNA Helicase",
        "RNA Primase"
      ],
      "correctIndex": 2,
      "explanation": "DNA Helicase breaks hydrogen bonds between bases to unwind and separate DNA strands at replication forks.",
      "difficulty": "Easy",
      "timeLimit": 30
    },
    {
      "id": "bio_6",
      "subjectId": "ap-biology",
      "stem": "What type of passive transport moves water across a selectively permeable membrane down its concentration gradient?",
      "options": [
        "Osmosis",
        "Active Transport",
        "Endocytosis",
        "Phagocytosis"
      ],
      "correctIndex": 0,
      "explanation": "Osmosis is the net diffusion of water across a semipermeable membrane from low solute to high solute concentration.",
      "difficulty": "Medium",
      "timeLimit": 45
    },
    {
      "id": "bio_7",
      "subjectId": "ap-biology",
      "stem": "Which molecule carries genetic codons from the nucleus to ribosomes for translation?",
      "options": [
        "tRNA",
        "rRNA",
        "mRNA",
        "snRNA"
      ],
      "correctIndex": 2,
      "explanation": "Messenger RNA (mRNA) transcribes genetic code from DNA and carries it to ribosomes to synthesize polypeptide chains.",
      "difficulty": "Medium",
      "timeLimit": 45
    },
    {
      "id": "bio_8",
      "subjectId": "ap-biology",
      "stem": "Enzymes accelerate biological reactions primarily by:",
      "options": [
        "Increasing the free energy change ($\\Delta G$)",
        "Lowering the activation energy ($E_a$)",
        "Raising reaction temperature",
        "Consuming reactants"
      ],
      "correctIndex": 1,
      "explanation": "Enzymes act as catalysts by stabilizing transition states and lowering activation energy ($E_a$) without altering $\\Delta G$.",
      "difficulty": "Medium",
      "timeLimit": 45
    },
    {
      "id": "bio_9",
      "subjectId": "ap-biology",
      "stem": "Which phase of mitosis is characterized by chromosomes aligning along the cell equatorial plate?",
      "options": [
        "Prophase",
        "Metaphase",
        "Anaphase",
        "Telophase"
      ],
      "correctIndex": 1,
      "explanation": "During metaphase, spindle fibers align duplicated sister chromatids along the metaphase plate in the center of the cell.",
      "difficulty": "Medium",
      "timeLimit": 45
    },
    {
      "id": "bio_10",
      "subjectId": "ap-biology",
      "stem": "In the Hardy-Weinberg equilibrium ($p^2 + 2pq + q^2 = 1$), what does the term $2pq$ represent?",
      "options": [
        "Frequency of homozygous dominant individuals",
        "Frequency of heterozygous individuals",
        "Frequency of homozygous recessive individuals",
        "Frequency of dominant alleles"
      ],
      "correctIndex": 1,
      "explanation": "$p^2$ represents homozygous dominant, $q^2$ represents homozygous recessive, and $2pq$ represents heterozygous genotypes.",
      "difficulty": "Medium",
      "timeLimit": 45
    },
    {
      "id": "bio_11",
      "subjectId": "ap-biology",
      "stem": "Which light-absorbing pigment is primary in driving photosynthesis in green plants?",
      "options": [
        "Carotenoids",
        "Chlorophyll a",
        "Anthocyanin",
        "Xanthophyll"
      ],
      "correctIndex": 1,
      "explanation": "Chlorophyll a absorbs blue and red wavelengths while reflecting green light, acting as the primary reaction center pigment.",
      "difficulty": "Hard",
      "timeLimit": 60
    },
    {
      "id": "bio_12",
      "subjectId": "ap-biology",
      "stem": "What cellular process yields four genetically diverse haploid daughter gametes?",
      "options": [
        "Mitosis",
        "Meiosis",
        "Binary Fission",
        "Budding"
      ],
      "correctIndex": 1,
      "explanation": "Meiosis consists of two successive cell divisions that reduce diploid chromosome numbers by half, producing four unique haploid gametes.",
      "difficulty": "Hard",
      "timeLimit": 60
    },
    {
      "id": "bio_13",
      "subjectId": "ap-biology",
      "stem": "Which hormone is known to induce fruit ripening and promote plant leaf abscission?",
      "options": [
        "Auxin",
        "Ethylene",
        "Gibberellin",
        "Abscisic acid"
      ],
      "correctIndex": 1,
      "explanation": "Ethylene is a gaseous plant hormone that coordinates fruit ripening and senescence via positive feedback.",
      "difficulty": "Hard",
      "timeLimit": 60
    },
    {
      "id": "bio_14",
      "subjectId": "ap-biology",
      "stem": "In prokaryotes, the operon model regulates gene expression. What binds to the operator to block transcription?",
      "options": [
        "RNA Polymerase",
        "Repressor Protein",
        "Corepressor",
        "Inducer"
      ],
      "correctIndex": 1,
      "explanation": "A repressor protein physically binds to the operator region of DNA, preventing RNA polymerase from transcribing structural genes.",
      "difficulty": "Hard",
      "timeLimit": 60
    },
    {
      "id": "bio_15",
      "subjectId": "ap-biology",
      "stem": "A competitive inhibitor decreases the rate of an enzymatic reaction by:",
      "options": [
        "Binding permanently to the allosteric site",
        "Binding directly to the active site",
        "Denaturing the tertiary protein structure",
        "Altering reaction pH"
      ],
      "correctIndex": 1,
      "explanation": "Competitive inhibitors mimic substrate shape and compete directly for binding at the catalytic active site.",
      "difficulty": "Hard",
      "timeLimit": 60
    }
  ],
  "ap-chemistry": [
    {
      "id": "chem_1",
      "subjectId": "ap-chemistry",
      "stem": "What is the pH of a $0.001\\text{ M } \\text{HCl}$ aqueous solution?",
      "options": [
        "$1$",
        "$3$",
        "$7$",
        "$11$"
      ],
      "correctIndex": 1,
      "explanation": "$\\text{HCl}$ is a strong acid that dissociates completely: $[H^+] = 10^{-3}\\text{ M}$. $\\text{pH} = -\\log[H^+] = 3$.",
      "difficulty": "Easy",
      "timeLimit": 30
    },
    {
      "id": "chem_2",
      "subjectId": "ap-chemistry",
      "stem": "According to VSEPR theory, what is the molecular geometry of a water molecule ($H_2O$)?",
      "options": [
        "Linear",
        "Trigonal Planar",
        "Bent",
        "Tetrahedral"
      ],
      "correctIndex": 2,
      "explanation": "Water has 4 electron domains (2 bonding pairs, 2 lone pairs) on the central oxygen atom, yielding a bent molecular geometry (~$104.5^\\circ$).",
      "difficulty": "Easy",
      "timeLimit": 30
    },
    {
      "id": "chem_3",
      "subjectId": "ap-chemistry",
      "stem": "Which element has the highest electronegativity on the Pauling scale?",
      "options": [
        "Oxygen ($O$)",
        "Fluorine ($F$)",
        "Chlorine ($Cl$)",
        "Cesium ($Cs$)"
      ],
      "correctIndex": 1,
      "explanation": "Fluorine ($F$) is the most electronegative element with a Pauling value of 3.98.",
      "difficulty": "Easy",
      "timeLimit": 30
    },
    {
      "id": "chem_4",
      "subjectId": "ap-chemistry",
      "stem": "For an exothermic reaction at equilibrium ($A \\rightleftharpoons B + \\text{heat}$), what happens if temperature is increased?",
      "options": [
        "Shifts toward products ($B$)",
        "Shifts toward reactants ($A$)",
        "Equilibrium constant $K$ increases",
        "No change occurs"
      ],
      "correctIndex": 1,
      "explanation": "By Le Chatelier's principle, adding heat to an exothermic reaction shifts the equilibrium toward the endothermic direction (reactants $A$) and decreases $K$.",
      "difficulty": "Easy",
      "timeLimit": 30
    },
    {
      "id": "chem_5",
      "subjectId": "ap-chemistry",
      "stem": "What type of intermolecular force is primarily responsible for the unusually high boiling point of water?",
      "options": [
        "London dispersion forces",
        "Dipole-dipole forces",
        "Hydrogen bonding",
        "Ionic bonding"
      ],
      "correctIndex": 2,
      "explanation": "Strong hydrogen bonds between hydrogen atoms bonded to highly electronegative oxygen atoms cause water to have an elevated boiling point.",
      "difficulty": "Easy",
      "timeLimit": 30
    },
    {
      "id": "chem_6",
      "subjectId": "ap-chemistry",
      "stem": "What is the oxidation number of sulfur in the sulfate ion ($SO_4^{2-}$)?",
      "options": [
        "$+4$",
        "$+6$",
        "$-2$",
        "$+2$"
      ],
      "correctIndex": 1,
      "explanation": "$S + 4(-2) = -2 \\implies S - 8 = -2 \\implies S = +6$.",
      "difficulty": "Medium",
      "timeLimit": 45
    },
    {
      "id": "chem_7",
      "subjectId": "ap-chemistry",
      "stem": "If a gas occupies $2.0\\text{ L}$ at $1.0\\text{ atm}$, what volume will it occupy at $4.0\\text{ atm}$ at constant temperature?",
      "options": [
        "$0.5\\text{ L}$",
        "$1.0\\text{ L}$",
        "$8.0\\text{ L}$",
        "$2.0\\text{ L}$"
      ],
      "correctIndex": 0,
      "explanation": "By Boyle's Law: $P_1 V_1 = P_2 V_2 \\implies (1.0)(2.0) = (4.0) V_2 \\implies V_2 = 0.5\\text{ L}$.",
      "difficulty": "Medium",
      "timeLimit": 45
    },
    {
      "id": "chem_8",
      "subjectId": "ap-chemistry",
      "stem": "Which thermodynamic state function must be negative for a process to be spontaneous at constant temperature and pressure?",
      "options": [
        "$\\Delta H$",
        "$\\Delta S$",
        "$\\Delta G$",
        "$\\Delta E$"
      ],
      "correctIndex": 2,
      "explanation": "A process is strictly spontaneous if and only if Gibbs Free Energy change is negative ($\\Delta G < 0$).",
      "difficulty": "Medium",
      "timeLimit": 45
    },
    {
      "id": "chem_9",
      "subjectId": "ap-chemistry",
      "stem": "In the reaction rate law $\\text{Rate} = k [A]^2 [B]$, what is the overall reaction order?",
      "options": [
        "$1$",
        "$2$",
        "$3$",
        "$0$"
      ],
      "correctIndex": 2,
      "explanation": "The overall reaction order is the sum of reactant exponents: $2 + 1 = 3$.",
      "difficulty": "Medium",
      "timeLimit": 45
    },
    {
      "id": "chem_10",
      "subjectId": "ap-chemistry",
      "stem": "How many valence electrons does a neutral chlorine ($Cl$) atom possess?",
      "options": [
        "$5$",
        "$7$",
        "$8$",
        "$17$"
      ],
      "correctIndex": 1,
      "explanation": "Chlorine is a halogen in Group 17 with electron configuration $[Ne] 3s^2 3p^5$, giving 7 valence electrons.",
      "difficulty": "Medium",
      "timeLimit": 45
    },
    {
      "id": "chem_11",
      "subjectId": "ap-chemistry",
      "stem": "A buffer solution can be prepared by mixing approximately equal molar quantities of:",
      "options": [
        "$\\text{HCl}$ and $\\text{NaCl}$",
        "$\\text{CH}_3\\text{COOH}$ and $\\text{CH}_3\\text{COONa}$",
        "$\\text{NaOH}$ and $\\text{NaCl}$",
        "$\\text{HNO}_3$ and $\\text{KNO}_3$"
      ],
      "correctIndex": 1,
      "explanation": "A buffer requires a weak acid (acetic acid) and its conjugate base (sodium acetate).",
      "difficulty": "Hard",
      "timeLimit": 60
    },
    {
      "id": "chem_12",
      "subjectId": "ap-chemistry",
      "stem": "Which element has the largest atomic radius among the following?",
      "options": [
        "Lithium ($Li$)",
        "Sodium ($Na$)",
        "Potassium ($K$)",
        "Rubidium ($Rb$)"
      ],
      "correctIndex": 3,
      "explanation": "Atomic radius increases going down a group due to the addition of principal energy levels (electron shielding).",
      "difficulty": "Hard",
      "timeLimit": 60
    },
    {
      "id": "chem_13",
      "subjectId": "ap-chemistry",
      "stem": "In an electrochemical cell, reduction always occurs at the:",
      "options": [
        "Anode",
        "Cathode",
        "Salt Bridge",
        "Voltmeter"
      ],
      "correctIndex": 1,
      "explanation": "Remember RED CAT: REDuction always takes place at the CAThode.",
      "difficulty": "Hard",
      "timeLimit": 60
    },
    {
      "id": "chem_14",
      "subjectId": "ap-chemistry",
      "stem": "What is the hybridization of the carbon atom in methane ($CH_4$)?",
      "options": [
        "$sp$",
        "$sp^2$",
        "$sp^3$",
        "$sp^3d$"
      ],
      "correctIndex": 2,
      "explanation": "Methane has 4 single $\\sigma$ bonds and zero lone pairs on carbon, requiring $sp^3$ orbital hybridization.",
      "difficulty": "Hard",
      "timeLimit": 60
    },
    {
      "id": "chem_15",
      "subjectId": "ap-chemistry",
      "stem": "What happens to the vapor pressure of a liquid as its temperature increases?",
      "options": [
        "It decreases",
        "It increases exponentially",
        "It remains constant",
        "It drops to zero"
      ],
      "correctIndex": 1,
      "explanation": "As temperature increases, more molecules possess sufficient kinetic energy to overcome intermolecular attractions, increasing vapor pressure.",
      "difficulty": "Hard",
      "timeLimit": 60
    }
  ],
  "ap-us-history": [
    {
      "id": "apush_1",
      "subjectId": "ap-us-history",
      "stem": "The primary purpose of the Monroe Doctrine (1823) was to:",
      "options": [
        "Secure American colonies in Africa",
        "Warn European powers against further colonization in the Western Hemisphere",
        "Form a military alliance with Great Britain",
        "Annex Cuba and Puerto Rico immediately"
      ],
      "correctIndex": 1,
      "explanation": "President Monroe declared the American continents closed to future European colonization and interference.",
      "difficulty": "Easy",
      "timeLimit": 30
    },
    {
      "id": "apush_2",
      "subjectId": "ap-us-history",
      "stem": "Which constitutional amendment formally abolished slavery throughout the United States?",
      "options": [
        "13th Amendment",
        "14th Amendment",
        "15th Amendment",
        "19th Amendment"
      ],
      "correctIndex": 0,
      "explanation": "The 13th Amendment (ratified in 1865) explicitly abolished slavery and involuntary servitude except as punishment for a crime.",
      "difficulty": "Easy",
      "timeLimit": 30
    },
    {
      "id": "apush_3",
      "subjectId": "ap-us-history",
      "stem": "Thomas Paine published Common Sense in 1776 primarily to:",
      "options": [
        "Support reconciliation with King George III",
        "Convince American colonists to declare complete independence from Great Britain",
        "Oppose the Continental Congress",
        "Advocate for French royal control of Canada"
      ],
      "correctIndex": 1,
      "explanation": "Common Sense used plain, persuasive language arguing that hereditary monarchy was tyrannical and independence was necessary.",
      "difficulty": "Easy",
      "timeLimit": 30
    },
    {
      "id": "apush_4",
      "subjectId": "ap-us-history",
      "stem": "What was the central goal of President Franklin D. Roosevelt New Deal programs in the 1930s?",
      "options": [
        "Expand American territories in the Pacific",
        "Provide Relief, Recovery, and Reform during the Great Depression",
        "Dismantle federal banking and regulation",
        "Privatize the national railway system"
      ],
      "correctIndex": 1,
      "explanation": "The New Deal focused on the Three Rs: Relief for the unemployed, Recovery of the economy, and Reform of financial systems.",
      "difficulty": "Easy",
      "timeLimit": 30
    },
    {
      "id": "apush_5",
      "subjectId": "ap-us-history",
      "stem": "The landmark Supreme Court decision Brown v. Board of Education (1954) ruled that:",
      "options": [
        "Separate but equal public facilities are constitutional",
        "Racial segregation in public schools is inherently unequal and unconstitutional",
        "States can regulate civil rights without federal oversight",
        "Affirmative action in college admissions is illegal"
      ],
      "correctIndex": 1,
      "explanation": "The Warren Court unanimously overturned Plessy v. Ferguson, ruling that racial segregation in public schools violates the 14th Amendment.",
      "difficulty": "Easy",
      "timeLimit": 30
    },
    {
      "id": "apush_6",
      "subjectId": "ap-us-history",
      "stem": "The Missouri Compromise of 1820 maintained sectional balance by admitting Missouri as a slave state and which state as a free state?",
      "options": [
        "Maine",
        "Kansas",
        "California",
        "Vermont"
      ],
      "correctIndex": 0,
      "explanation": "Maine was admitted as a free state, and slavery was prohibited north of latitude $36^\\circ 30'$ in the remainder of the Louisiana Territory.",
      "difficulty": "Medium",
      "timeLimit": 45
    },
    {
      "id": "apush_7",
      "subjectId": "ap-us-history",
      "stem": "Which 1890 event marked the tragic end of major armed conflict between the US Army and Native American Plains tribes?",
      "options": [
        "Battle of Little Bighorn",
        "Wounded Knee Massacre",
        "Trail of Tears",
        "Sand Creek Massacre"
      ],
      "correctIndex": 1,
      "explanation": "The massacre at Wounded Knee Creek, South Dakota, resulted in the deaths of approximately 300 Lakota Sioux and effectively ended Plains resistance.",
      "difficulty": "Medium",
      "timeLimit": 45
    },
    {
      "id": "apush_8",
      "subjectId": "ap-us-history",
      "stem": "What was the main purpose of the Federalist Papers written by Hamilton, Madison, and Jay?",
      "options": [
        "To urge ratification of the new United States Constitution",
        "To defend the Articles of Confederation",
        "To support the Declaration of Independence",
        "To protest against taxation in Massachusetts"
      ],
      "correctIndex": 0,
      "explanation": "The 85 essays argued persuasively for the ratification of the newly drafted US Constitution and a stronger federal republic.",
      "difficulty": "Medium",
      "timeLimit": 45
    },
    {
      "id": "apush_9",
      "subjectId": "ap-us-history",
      "stem": "The Seneca Falls Convention of 1848 is historically renowned as the inaugural national meeting dedicated to:",
      "options": [
        "Abolition of slavery",
        "Women rights and suffrage",
        "Labor union organizing",
        "Temperance and prohibition"
      ],
      "correctIndex": 1,
      "explanation": "Organized by Elizabeth Cady Stanton and Lucretia Mott, Seneca Falls produced the Declaration of Sentiments demanding equal rights for women.",
      "difficulty": "Medium",
      "timeLimit": 45
    },
    {
      "id": "apush_10",
      "subjectId": "ap-us-history",
      "stem": "President Lyndon B. Johnson signature domestic reform package was named the:",
      "options": [
        "Square Deal",
        "Fair Deal",
        "Great Society",
        "New Frontier"
      ],
      "correctIndex": 2,
      "explanation": "The Great Society introduced major legislation including Medicare, Medicaid, the Civil Rights Act, and the War on Poverty.",
      "difficulty": "Medium",
      "timeLimit": 45
    },
    {
      "id": "apush_11",
      "subjectId": "ap-us-history",
      "stem": "Which international incident prompted the United States to formally enter World War II in December 1941?",
      "options": [
        "Sinking of the Lusitania",
        "Japanese attack on Pearl Harbor",
        "Invasion of Poland",
        "Fall of France"
      ],
      "correctIndex": 1,
      "explanation": "On December 7, 1941, the Japanese surprise aerial attack on Pearl Harbor, Hawaii, brought the US into World War II.",
      "difficulty": "Hard",
      "timeLimit": 60
    },
    {
      "id": "apush_12",
      "subjectId": "ap-us-history",
      "stem": "The Progressive Era muckraker Upton Sinclair exposed unsanitary conditions in the meatpacking industry in his novel:",
      "options": [
        "The Jungle",
        "How the Other Half Lives",
        "The Grapes of Wrath",
        "The Octopus"
      ],
      "correctIndex": 0,
      "explanation": "The Jungle (1906) sparked public outrage that led directly to the passage of the Pure Food and Drug Act and Meat Inspection Act.",
      "difficulty": "Hard",
      "timeLimit": 60
    },
    {
      "id": "apush_13",
      "subjectId": "ap-us-history",
      "stem": "Under the Articles of Confederation, the national government lacked the crucial power to:",
      "options": [
        "Declare war",
        "Levy direct taxes",
        "Sign foreign treaties",
        "Operate a post office"
      ],
      "correctIndex": 1,
      "explanation": "The Confederation Congress had no power to tax citizens directly, leaving the central government chronically underfunded.",
      "difficulty": "Hard",
      "timeLimit": 60
    },
    {
      "id": "apush_14",
      "subjectId": "ap-us-history",
      "stem": "The Marshall Plan following World War II provided billions of dollars in economic aid primarily to:",
      "options": [
        "Rebuild war-torn Western European nations and resist communism",
        "Support Nationalist China",
        "Fund NASA lunar research",
        "Rebuild Latin American infrastructure"
      ],
      "correctIndex": 0,
      "explanation": "The Marshall Plan stabilized Western European economies to foster democratic prosperity and contain Soviet communist expansion.",
      "difficulty": "Hard",
      "timeLimit": 60
    },
    {
      "id": "apush_15",
      "subjectId": "ap-us-history",
      "stem": "Which technological innovation revolutionized cotton processing and unintentionally entrenched Southern slavery in the 1790s?",
      "options": [
        "Steam engine",
        "Cotton gin",
        "Spinning jenny",
        "Mechanical reaper"
      ],
      "correctIndex": 1,
      "explanation": "Eli Whitney cotton gin made short-staple cotton highly profitable, exponentially increasing Southern plantation demand for enslaved labor.",
      "difficulty": "Hard",
      "timeLimit": 60
    }
  ],
  "ap-psychology": [
    {
      "id": "psych_1",
      "subjectId": "ap-psychology",
      "stem": "In classical conditioning, an unlearned, naturally occurring response to an unconditioned stimulus is the:",
      "options": [
        "Conditioned response",
        "Unconditioned response",
        "Extinction response",
        "Neutral stimulus"
      ],
      "correctIndex": 1,
      "explanation": "The unconditioned response (e.g. salivating to food) is automatic and does not require prior learning.",
      "difficulty": "Easy",
      "timeLimit": 30
    },
    {
      "id": "psych_2",
      "subjectId": "ap-psychology",
      "stem": "Which brain structure plays the central role in consolidating short-term memory into long-term memory?",
      "options": [
        "Cerebellum",
        "Hippocampus",
        "Medulla",
        "Hypothalamus"
      ],
      "correctIndex": 1,
      "explanation": "The hippocampus is essential for processing and consolidating explicit, declarative memories.",
      "difficulty": "Easy",
      "timeLimit": 30
    },
    {
      "id": "psych_3",
      "subjectId": "ap-psychology",
      "stem": "According to Jean Piaget, during which cognitive developmental stage do children master the concept of conservation?",
      "options": [
        "Sensorimotor",
        "Preoperational",
        "Concrete Operational",
        "Formal Operational"
      ],
      "correctIndex": 2,
      "explanation": "During the concrete operational stage (ages ~7 to 11), children understand that quantity remains identical despite changes in shape.",
      "difficulty": "Easy",
      "timeLimit": 30
    },
    {
      "id": "psych_4",
      "subjectId": "ap-psychology",
      "stem": "Which neurotransmitter is most directly associated with motor control, reward-seeking, and Parkinson disease when depleted?",
      "options": [
        "Serotonin",
        "Dopamine",
        "Acetylcholine",
        "GABA"
      ],
      "correctIndex": 1,
      "explanation": "Dopamine pathways mediate pleasure and motor control; death of dopamine-producing neurons in the substantia nigra causes Parkinson disease.",
      "difficulty": "Easy",
      "timeLimit": 30
    },
    {
      "id": "psych_5",
      "subjectId": "ap-psychology",
      "stem": "The tendency to attribute other people actions to internal dispositions rather than external situations is called:",
      "options": [
        "Confirmation bias",
        "Fundamental attribution error",
        "Self-serving bias",
        "Cognitive dissonance"
      ],
      "correctIndex": 1,
      "explanation": "The fundamental attribution error describes overestimating personality traits and underestimating situational factors when judging others.",
      "difficulty": "Easy",
      "timeLimit": 30
    },
    {
      "id": "psych_6",
      "subjectId": "ap-psychology",
      "stem": "Which part of the autonomic nervous system is responsible for the fight-or-flight stress response?",
      "options": [
        "Parasympathetic nervous system",
        "Sympathetic nervous system",
        "Somatic nervous system",
        "Central nervous system"
      ],
      "correctIndex": 1,
      "explanation": "The sympathetic nervous system accelerates heart rate, dilates bronchi, and releases adrenaline during perceived threats.",
      "difficulty": "Medium",
      "timeLimit": 45
    },
    {
      "id": "psych_7",
      "subjectId": "ap-psychology",
      "stem": "In psychological research, what is a placebo effect?",
      "options": [
        "Improvement caused solely by patient expectations rather than an active treatment",
        "An error resulting from poor sample randomization",
        "A statistical correlation between two unrelated variables",
        "Memory distortion caused by leading questions"
      ],
      "correctIndex": 0,
      "explanation": "The placebo effect occurs when an inert substance or sham procedure produces genuine physiological or mental improvement due to expectations.",
      "difficulty": "Medium",
      "timeLimit": 45
    },
    {
      "id": "psych_8",
      "subjectId": "ap-psychology",
      "stem": "The serial position effect predicts that people remember items from a list best when they are:",
      "options": [
        "At the beginning and end of the list",
        "Only in the exact middle",
        "Presented at random intervals",
        "Repeated backwards"
      ],
      "correctIndex": 0,
      "explanation": "The primacy effect enhances recall of beginning items (LTM), while the recency effect enhances recall of final items (working memory).",
      "difficulty": "Medium",
      "timeLimit": 45
    },
    {
      "id": "psych_9",
      "subjectId": "ap-psychology",
      "stem": "Which famous experiment demonstrated that ordinary people would obey authority to deliver perceived lethal electric shocks?",
      "options": [
        "Stanford Prison Experiment",
        "Milgram Obedience Experiment",
        "Asch Conformity Study",
        "Little Albert Experiment"
      ],
      "correctIndex": 1,
      "explanation": "Stanley Milgram study showed that approximately 65% of participants would follow researcher instructions to deliver the maximum 450-volt shock.",
      "difficulty": "Medium",
      "timeLimit": 45
    },
    {
      "id": "psych_10",
      "subjectId": "ap-psychology",
      "stem": "Which sleep stage is characterized by rapid eye movements, temporary muscle paralysis, and vivid dreaming?",
      "options": [
        "Stage N1",
        "Stage N2",
        "Stage N3 (Deep Sleep)",
        "REM Sleep"
      ],
      "correctIndex": 3,
      "explanation": "Rapid Eye Movement (REM) sleep features high brain activity similar to wakefulness, accompanied by vivid dreaming and motor atonia.",
      "difficulty": "Medium",
      "timeLimit": 45
    },
    {
      "id": "psych_11",
      "subjectId": "ap-psychology",
      "stem": "Erik Erikson proposed that the primary psychosocial conflict during adolescence is:",
      "options": [
        "Trust vs. Mistrust",
        "Identity vs. Role Confusion",
        "Intimacy vs. Isolation",
        "Generativity vs. Stagnation"
      ],
      "correctIndex": 1,
      "explanation": "Adolescents (ages 12-18) grapple with discovering personal identity, core values, and life directions vs role confusion.",
      "difficulty": "Hard",
      "timeLimit": 60
    },
    {
      "id": "psych_12",
      "subjectId": "ap-psychology",
      "stem": "A Skinner box is a laboratory apparatus commonly used to study:",
      "options": [
        "Operant conditioning",
        "Classical conditioning",
        "Latent learning",
        "Observational modeling"
      ],
      "correctIndex": 0,
      "explanation": "B.F. Skinner utilized operant chambers where animals pressed levers to receive reinforcement or avoid punishment.",
      "difficulty": "Hard",
      "timeLimit": 60
    },
    {
      "id": "psych_13",
      "subjectId": "ap-psychology",
      "stem": "Bipolar disorder is clinically diagnosed by alternating episodes of severe depression and:",
      "options": [
        "Mania",
        "Catatonia",
        "Dissociation",
        "Amnesia"
      ],
      "correctIndex": 0,
      "explanation": "Bipolar disorder is characterized by dramatic mood shifts between debilitating depressive lows and euphoric, hyperactive manic highs.",
      "difficulty": "Hard",
      "timeLimit": 60
    },
    {
      "id": "psych_14",
      "subjectId": "ap-psychology",
      "stem": "Which sensory receptors in the human retina are specialized for night vision and peripheral motion detection?",
      "options": [
        "Cones",
        "Rods",
        "Foveal cells",
        "Bipolar ganglion cells"
      ],
      "correctIndex": 1,
      "explanation": "Rods operate in low-light conditions and detect black, white, and motion, while cones detect fine detail and color in bright light.",
      "difficulty": "Hard",
      "timeLimit": 60
    },
    {
      "id": "psych_15",
      "subjectId": "ap-psychology",
      "stem": "According to Maslow hierarchy of needs, which level must be satisfied immediately after basic physiological survival needs?",
      "options": [
        "Safety needs",
        "Belongingness and love",
        "Esteem needs",
        "Self-actualization"
      ],
      "correctIndex": 0,
      "explanation": "Once physiological needs (food, water, shelter) are met, individuals prioritize safety and security needs.",
      "difficulty": "Hard",
      "timeLimit": 60
    }
  ],
  "ap-computer-science-principles": [
    {
      "id": "csp_1",
      "subjectId": "ap-computer-science-principles",
      "stem": "How many distinct binary states or numbers can be represented using 8 bits (1 byte)?",
      "options": [
        "$64$",
        "$128$",
        "$256$",
        "$512$"
      ],
      "correctIndex": 2,
      "explanation": "Each bit has 2 possible states. $2^8 = 256$ distinct values (ranging from $0$ to $255$ in unsigned binary).",
      "difficulty": "Easy",
      "timeLimit": 30
    },
    {
      "id": "csp_2",
      "subjectId": "ap-computer-science-principles",
      "stem": "Which protocol is responsible for securely encrypting data transferred between a web browser and a website server?",
      "options": [
        "HTTP",
        "HTTPS (TLS/SSL)",
        "FTP",
        "DNS"
      ],
      "correctIndex": 1,
      "explanation": "HTTPS uses Transport Layer Security (TLS/SSL) to encrypt communications and prevent eavesdropping or tampering.",
      "difficulty": "Easy",
      "timeLimit": 30
    },
    {
      "id": "csp_3",
      "subjectId": "ap-computer-science-principles",
      "stem": "What is the primary difference between lossy and lossless data compression?",
      "options": [
        "Lossy compression discards redundant data that cannot be recovered",
        "Lossless compression always produces smaller files than lossy",
        "Lossy compression can perfectly reconstruct the original file bit-for-bit",
        "Lossless compression is only used for audio files"
      ],
      "correctIndex": 0,
      "explanation": "Lossy compression achieves smaller sizes by permanently removing less perceptible data, whereas lossless preserves 100% of original bits.",
      "difficulty": "Easy",
      "timeLimit": 30
    },
    {
      "id": "csp_4",
      "subjectId": "ap-computer-science-principles",
      "stem": "In algorithm design, a binary search algorithm requires the dataset to be:",
      "options": [
        "Sorted",
        "Randomized",
        "Stored in hexadecimal",
        "Smaller than 100 elements"
      ],
      "correctIndex": 0,
      "explanation": "Binary search operates in $O(\\log n)$ by repeatedly halving the search interval, which requires elements to be pre-sorted.",
      "difficulty": "Easy",
      "timeLimit": 30
    },
    {
      "id": "csp_5",
      "subjectId": "ap-computer-science-principles",
      "stem": "What is the decimal (base 10) value of the binary number `1101`?",
      "options": [
        "$11$",
        "$13$",
        "$15$",
        "$9$"
      ],
      "correctIndex": 1,
      "explanation": "$1 \\times 2^3 + 1 \\times 2^2 + 0 \\times 2^1 + 1 \\times 2^0 = 8 + 4 + 0 + 1 = 13$.",
      "difficulty": "Easy",
      "timeLimit": 30
    },
    {
      "id": "csp_6",
      "subjectId": "ap-computer-science-principles",
      "stem": "What role does the Domain Name System (DNS) perform on the Internet?",
      "options": [
        "Translates human-friendly domain names (e.g. google.com) into numerical IP addresses",
        "Physically connects fiber-optic cables across oceans",
        "Encrypts email messages with public keys",
        "Stores website cookies on client devices"
      ],
      "correctIndex": 0,
      "explanation": "DNS acts as the phonebook of the Internet, mapping human-readable hostnames to routable IP addresses.",
      "difficulty": "Medium",
      "timeLimit": 45
    },
    {
      "id": "csp_7",
      "subjectId": "ap-computer-science-principles",
      "stem": "A symmetric encryption algorithm uses:",
      "options": [
        "The same key for both encryption and decryption",
        "A public key to encrypt and a private key to decrypt",
        "No keys at all",
        "A different key for every single character"
      ],
      "correctIndex": 0,
      "explanation": "Symmetric key cryptography uses a single shared secret key for both encrypting and decrypting data.",
      "difficulty": "Medium",
      "timeLimit": 45
    },
    {
      "id": "csp_8",
      "subjectId": "ap-computer-science-principles",
      "stem": "Which logic gate produces an output of 1 (TRUE) if and only if both inputs are 1 (TRUE)?",
      "options": [
        "OR Gate",
        "AND Gate",
        "NOT Gate",
        "XOR Gate"
      ],
      "correctIndex": 1,
      "explanation": "An AND gate strictly requires all inputs to be TRUE in order to output TRUE.",
      "difficulty": "Medium",
      "timeLimit": 45
    },
    {
      "id": "csp_9",
      "subjectId": "ap-computer-science-principles",
      "stem": "What is an abstraction in computer science?",
      "options": [
        "Hiding complex implementation details and exposing only essential functionality",
        "A hardware failure in memory RAM",
        "Compressing image pixels",
        "Converting code into binary by hand"
      ],
      "correctIndex": 0,
      "explanation": "Abstraction manages complexity by breaking systems into layers and hiding low-level details behind simple interfaces.",
      "difficulty": "Medium",
      "timeLimit": 45
    },
    {
      "id": "csp_10",
      "subjectId": "ap-computer-science-principles",
      "stem": "If a program executes a loop `FOR i = 1 TO 4` and multiplies variable `p = p * 2` (starting with `p = 1`), what is `p` after the loop?",
      "options": [
        "$8$",
        "$16$",
        "$32$",
        "$4$"
      ],
      "correctIndex": 1,
      "explanation": "After 4 iterations: $1 \\to 2 \\to 4 \\to 8 \\to 16$.",
      "difficulty": "Medium",
      "timeLimit": 45
    },
    {
      "id": "csp_11",
      "subjectId": "ap-computer-science-principles",
      "stem": "What is the primary benefit of fault tolerance in Internet routing protocols like TCP/IP?",
      "options": [
        "Traffic can be automatically rerouted if individual routers or cables fail",
        "Websites load instantaneously without buffering",
        "Passwords cannot be guessed by brute force",
        "All data packets arrive in exact numerical sequence without reassembly"
      ],
      "correctIndex": 0,
      "explanation": "Redundant routing paths allow packets to navigate around severed lines or offline nodes without crashing the network.",
      "difficulty": "Hard",
      "timeLimit": 60
    },
    {
      "id": "csp_12",
      "subjectId": "ap-computer-science-principles",
      "stem": "Which type of software license allows users to view, modify, and distribute the underlying source code freely?",
      "options": [
        "Proprietary license",
        "Open-source license",
        "Commercial copyright",
        "Freemium trial"
      ],
      "correctIndex": 1,
      "explanation": "Open-source software licenses grant anyone the freedom to inspect, adapt, and redistribute the program code.",
      "difficulty": "Hard",
      "timeLimit": 60
    },
    {
      "id": "csp_13",
      "subjectId": "ap-computer-science-principles",
      "stem": "What is phishing in cybersecurity?",
      "options": [
        "A social engineering attack disguised as a trustworthy entity to steal sensitive credentials",
        "An automated script that floods network bandwidth",
        "A hardware keylogger plugged into a USB port",
        "A virus that encrypts hard drives for ransom"
      ],
      "correctIndex": 0,
      "explanation": "Phishing uses deceptive emails or websites that impersonate banks or services to trick victims into sharing passwords or personal data.",
      "difficulty": "Hard",
      "timeLimit": 60
    },
    {
      "id": "csp_14",
      "subjectId": "ap-computer-science-principles",
      "stem": "In parallel computing, speedup is limited primarily by:",
      "options": [
        "The portion of the task that must run sequentially (Amdahl law)",
        "The operating system user interface",
        "The color of the motherboard",
        "The size of the hard drive"
      ],
      "correctIndex": 0,
      "explanation": "Amdahl law demonstrates that the non-parallelizable, sequential components of a program cap the maximum theoretical speedup.",
      "difficulty": "Hard",
      "timeLimit": 60
    },
    {
      "id": "csp_15",
      "subjectId": "ap-computer-science-principles",
      "stem": "What is metadata in the context of digital photos and communications?",
      "options": [
        "Data that provides information about other data (e.g. timestamp, camera model, GPS coordinates)",
        "The raw hexadecimal pixels of the image",
        "A temporary cache stored in CPU registers",
        "The backup copy of an encrypted file"
      ],
      "correctIndex": 0,
      "explanation": "Metadata describes characteristics of a file\u2014such as author, date created, file format, and resolution\u2014without being the content itself.",
      "difficulty": "Hard",
      "timeLimit": 60
    }
  ],
  "ap-physics": [
    {
      "id": "phys_1",
      "subjectId": "ap-physics-1",
      "stem": "An object is dropped from rest from a cliff. Neglecting air resistance, what is its speed after $3.0\\text{ s}$? ($g = 9.8\\text{ m/s}^2$)",
      "options": [
        "$14.7\\text{ m/s}$",
        "$29.4\\text{ m/s}$",
        "$44.1\\text{ m/s}$",
        "$9.8\\text{ m/s}$"
      ],
      "correctIndex": 1,
      "explanation": "$v = v_0 + gt = 0 + (9.8)(3.0) = 29.4\\text{ m/s}$.",
      "difficulty": "Easy",
      "timeLimit": 30
    },
    {
      "id": "phys_2",
      "subjectId": "ap-physics-1",
      "stem": "A net external force $F$ acts on an object of mass $m$, giving it acceleration $a$. If the mass is doubled and force is halved, what is the new acceleration?",
      "options": [
        "$4a$",
        "$2a$",
        "$\\frac{a}{2}$",
        "$\\frac{a}{4}$"
      ],
      "correctIndex": 3,
      "explanation": "$a_{new} = \\frac{F/2}{2m} = \\frac{1}{4} \\frac{F}{m} = \\frac{a}{4}$.",
      "difficulty": "Easy",
      "timeLimit": 30
    },
    {
      "id": "phys_3",
      "subjectId": "ap-physics-1",
      "stem": "A car travels in a horizontal circle of radius $R$ at constant speed $v$. What force provides the centripetal acceleration?",
      "options": [
        "Centrifugal force",
        "Static friction between tires and road",
        "Gravitational force",
        "Normal force from the ground"
      ],
      "correctIndex": 1,
      "explanation": "Static friction between the car tires and the road surface prevents slipping and points towards the circle center.",
      "difficulty": "Easy",
      "timeLimit": 30
    },
    {
      "id": "phys_4",
      "subjectId": "ap-physics-1",
      "stem": "A $2\\text{ kg}$ cart moving at $3\\text{ m/s}$ collides and sticks to a stationary $1\\text{ kg}$ cart. What is their final common speed?",
      "options": [
        "$1.5\\text{ m/s}$",
        "$2.0\\text{ m/s}$",
        "$2.5\\text{ m/s}$",
        "$3.0\\text{ m/s}$"
      ],
      "correctIndex": 1,
      "explanation": "Conservation of momentum: $p_i = (2)(3) + 0 = 6\\text{ kg}\\cdot\\text{m/s}$. $v_f = \\frac{6}{2 + 1} = 2.0\\text{ m/s}$.",
      "difficulty": "Easy",
      "timeLimit": 30
    },
    {
      "id": "phys_5",
      "subjectId": "ap-physics-1",
      "stem": "A simple pendulum has period $T$ on Earth. If the length of the string is quadrupled ($4L$), what is the new period?",
      "options": [
        "$4T$",
        "$2T$",
        "$\\frac{T}{2}$",
        "$\\sqrt{2}T$"
      ],
      "correctIndex": 1,
      "explanation": "$T = 2\\pi\\sqrt{\\frac{L}{g}}$. Replacing $L$ with $4L$ gives $T_{new} = 2\\pi\\sqrt{\\frac{4L}{g}} = 2 T$.",
      "difficulty": "Easy",
      "timeLimit": 30
    },
    {
      "id": "phys_6",
      "subjectId": "ap-physics-1",
      "stem": "How much work is done by the gravitational force on a $5\\text{ kg}$ satellite in a circular orbit of radius $R$ during one full revolution?",
      "options": [
        "$0\\text{ J}$",
        "$5\\pi R\\text{ J}$",
        "$10g R\\text{ J}$",
        "$50\\text{ J}$"
      ],
      "correctIndex": 0,
      "explanation": "Gravity is perpendicular to the displacement vector at every point in a circular orbit ($W = F d \\cos(90^\\circ) = 0\\text{ J}$).",
      "difficulty": "Medium",
      "timeLimit": 45
    },
    {
      "id": "phys_7",
      "subjectId": "ap-physics-1",
      "stem": "A spring with spring constant $k = 200\\text{ N/m}$ is compressed by $0.1\\text{ m}$. What is the stored elastic potential energy?",
      "options": [
        "$1.0\\text{ J}$",
        "$2.0\\text{ J}$",
        "$10\\text{ J}$",
        "$20\\text{ J}$"
      ],
      "correctIndex": 0,
      "explanation": "$U_s = \\frac{1}{2} k x^2 = \\frac{1}{2} (200) (0.1)^2 = 100 \\times 0.01 = 1.0\\text{ J}$.",
      "difficulty": "Medium",
      "timeLimit": 45
    },
    {
      "id": "phys_8",
      "subjectId": "ap-physics-1",
      "stem": "A solid disk and a hollow ring of identical mass and radius roll down an incline without slipping. Which reaches the bottom first?",
      "options": [
        "The hollow ring",
        "The solid disk",
        "Both at the same time",
        "Depends on the incline angle"
      ],
      "correctIndex": 1,
      "explanation": "The solid disk has a smaller rotational inertia ($I = \\frac{1}{2}MR^2 < MR^2$), converting more PE into translational KE, so it accelerates faster.",
      "difficulty": "Medium",
      "timeLimit": 45
    },
    {
      "id": "phys_9",
      "subjectId": "ap-physics-1",
      "stem": "An elevator is accelerating upwards at $2\\text{ m/s}^2$. What apparent weight does an $80\\text{ kg}$ passenger feel? ($g = 10\\text{ m/s}^2$)",
      "options": [
        "$640\\text{ N}$",
        "$800\\text{ N}$",
        "$960\\text{ N}$",
        "$160\\text{ N}$"
      ],
      "correctIndex": 2,
      "explanation": "$N - mg = ma \\implies N = m(g + a) = 80(10 + 2) = 960\\text{ N}$.",
      "difficulty": "Medium",
      "timeLimit": 45
    },
    {
      "id": "phys_10",
      "subjectId": "ap-physics-1",
      "stem": "What happens to the total mechanical energy of a falling apple if air resistance is negligible?",
      "options": [
        "It increases",
        "It decreases",
        "It remains constant",
        "It oscillates"
      ],
      "correctIndex": 2,
      "explanation": "With only conservative gravitational forces doing work, total mechanical energy ($KE + PE$) remains strictly conserved.",
      "difficulty": "Medium",
      "timeLimit": 45
    },
    {
      "id": "phys_11",
      "subjectId": "ap-physics-1",
      "stem": "A net torque of $20\\text{ N}\\cdot\\text{m}$ acts on a wheel with moment of inertia $I = 4\\text{ kg}\\cdot\\text{m}^2$. What is the angular acceleration $\\alpha$?",
      "options": [
        "$5\\text{ rad/s}^2$",
        "$80\\text{ rad/s}^2$",
        "$0.2\\text{ rad/s}^2$",
        "$16\\text{ rad/s}^2$"
      ],
      "correctIndex": 0,
      "explanation": "$\\tau = I\\alpha \\implies \\alpha = \\frac{\\tau}{I} = \\frac{20}{4} = 5\\text{ rad/s}^2$.",
      "difficulty": "Hard",
      "timeLimit": 60
    },
    {
      "id": "phys_12",
      "subjectId": "ap-physics-1",
      "stem": "A projectile launched at angle $\\theta$ has maximum horizontal range when $\\theta$ equals:",
      "options": [
        "$30^\\circ$",
        "$45^\\circ$",
        "$60^\\circ$",
        "$90^\\circ$"
      ],
      "correctIndex": 1,
      "explanation": "Range $R = \\frac{v_0^2 \\sin(2\\theta)}{g}$, which reaches maximum when $\\sin(2\\theta) = 1 \\implies \\theta = 45^\\circ$.",
      "difficulty": "Hard",
      "timeLimit": 60
    },
    {
      "id": "phys_13",
      "subjectId": "ap-physics-1",
      "stem": "An astronaut floating in space throws a wrench forward. What happens to the astronaut?",
      "options": [
        "Moves forward faster",
        "Moves backward with equal momentum",
        "Remains stationary",
        "Spins continuously in place"
      ],
      "correctIndex": 1,
      "explanation": "By conservation of momentum ($p_{initial} = 0$), $p_{astronaut} = -p_{wrench}$, so the astronaut recoils backward.",
      "difficulty": "Hard",
      "timeLimit": 60
    },
    {
      "id": "phys_14",
      "subjectId": "ap-physics-1",
      "stem": "If the distance between two gravitational masses is doubled, the gravitational force between them is multiplied by:",
      "options": [
        "$2$",
        "$\\frac{1}{2}$",
        "$\\frac{1}{4}$",
        "$4$"
      ],
      "correctIndex": 2,
      "explanation": "Newton's law of universal gravitation follows an inverse-square law: $F \\propto \\frac{1}{r^2} \\implies \\frac{1}{2^2} = \\frac{1}{4}$.",
      "difficulty": "Hard",
      "timeLimit": 60
    },
    {
      "id": "phys_15",
      "subjectId": "ap-physics-1",
      "stem": "What physical quantity is represented by the area under a Force vs. Time graph?",
      "options": [
        "Work",
        "Kinetic Energy",
        "Impulse",
        "Power"
      ],
      "correctIndex": 2,
      "explanation": "Impulse $J = \\int F dt = \\Delta p$, which corresponds directly to the area under a Force-Time graph.",
      "difficulty": "Hard",
      "timeLimit": 60
    }
  ],
  "ap-calculus-bc": [
    {
      "id": "calc_bc_1",
      "subjectId": "ap-calculus-bc",
      "stem": "Evaluate $\\int x e^x dx$ using integration by parts.",
      "options": [
        "$e^x(x - 1) + C$",
        "$e^x(x + 1) + C$",
        "$x^2 e^x + C$",
        "$\\frac{1}{2}x^2 e^x + C$"
      ],
      "correctIndex": 0,
      "explanation": "Using $\\int u dv = uv - \\int v du$ with $u = x, dv = e^x dx$: $x e^x - \\int e^x dx = e^x(x - 1) + C$.",
      "difficulty": "Easy",
      "timeLimit": 30
    },
    {
      "id": "calc_bc_2",
      "subjectId": "ap-calculus-bc",
      "stem": "What is the Maclaurin series expansion of $\\cos(x)$?",
      "options": [
        "$\\sum_{n=0}^\\infty \\frac{(-1)^n x^{2n}}{(2n)!}$",
        "$\\sum_{n=0}^\\infty \\frac{(-1)^n x^{2n+1}}{(2n+1)!}$",
        "$\\sum_{n=0}^\\infty \\frac{x^n}{n!}$",
        "$\\sum_{n=0}^\\infty (-1)^n x^n$"
      ],
      "correctIndex": 0,
      "explanation": "The cosine function is even, giving the alternating series $\\cos(x) = 1 - \\frac{x^2}{2!} + \\frac{x^4}{4!} - \\dots = \\sum_{n=0}^\\infty \\frac{(-1)^n x^{2n}}{(2n)!}$.",
      "difficulty": "Easy",
      "timeLimit": 30
    },
    {
      "id": "calc_bc_3",
      "subjectId": "ap-calculus-bc",
      "stem": "Find the radius of convergence of $\\sum_{n=1}^\\infty \\frac{(x - 3)^n}{n \\cdot 2^n}$.",
      "options": [
        "$R = 1$",
        "$R = 2$",
        "$R = 3$",
        "$R = \\infty$"
      ],
      "correctIndex": 1,
      "explanation": "Using ratio test: $\\lim_{n \\to \\infty} |\\frac{x-3}{2}| \\frac{n}{n+1} = \\frac{|x-3|}{2} < 1 \\implies |x - 3| < 2 \\implies R = 2$.",
      "difficulty": "Easy",
      "timeLimit": 30
    },
    {
      "id": "calc_bc_4",
      "subjectId": "ap-calculus-bc",
      "stem": "What is the area enclosed by one loop of the polar curve $r = 4\\sin(\\theta)$?",
      "options": [
        "$2\\pi$",
        "$4\\pi$",
        "$8\\pi$",
        "$16\\pi$"
      ],
      "correctIndex": 1,
      "explanation": "Area $= \\frac{1}{2} \\int_0^\\pi (4\\sin\\theta)^2 d\\theta = 8 \\int_0^\\pi \\sin^2\\theta d\\theta = 8 \\cdot \\frac{\\pi}{2} = 4\\pi$.",
      "difficulty": "Easy",
      "timeLimit": 30
    },
    {
      "id": "calc_bc_5",
      "subjectId": "ap-calculus-bc",
      "stem": "The improper integral $\\int_1^\\infty \\frac{1}{x^p} dx$ converges if and only if:",
      "options": [
        "$p > 1$",
        "$p \\ge 1$",
        "$p < 1$",
        "$p = 0$"
      ],
      "correctIndex": 0,
      "explanation": "By the p-series integral test, $\\int_1^\\infty \\frac{1}{x^p} dx$ converges strictly when $p > 1$.",
      "difficulty": "Easy",
      "timeLimit": 30
    },
    {
      "id": "calc_bc_6",
      "subjectId": "ap-calculus-bc",
      "stem": "A particle position is given by $x(t) = t^2, y(t) = 2t$. What is its speed at $t = 1$?",
      "options": [
        "$\\sqrt{8}$",
        "$2\\sqrt{2}$",
        "$\\sqrt{2^2 + 2^2} = \\sqrt{8}$",
        "$4$"
      ],
      "correctIndex": 1,
      "explanation": "Speed $= \\sqrt{(x'(t))^2 + (y'(t))^2} = \\sqrt{(2t)^2 + 2^2}$. At $t = 1$: $\\sqrt{4 + 4} = \\sqrt{8} = 2\\sqrt{2}$.",
      "difficulty": "Medium",
      "timeLimit": 45
    },
    {
      "id": "calc_bc_7",
      "subjectId": "ap-calculus-bc",
      "stem": "Which test is most conclusive to determine convergence of $\\sum_{n=1}^\\infty \\frac{(-1)^n}{\\sqrt{n}}$?",
      "options": [
        "Alternating Series Test",
        "Integral Test",
        "Direct Comparison with $n$",
        "Ratio Test"
      ],
      "correctIndex": 0,
      "explanation": "Since $\\frac{1}{\\sqrt{n}}$ decreases monotonically to $0$, the Alternating Series Test guarantees conditional convergence.",
      "difficulty": "Medium",
      "timeLimit": 45
    },
    {
      "id": "calc_bc_8",
      "subjectId": "ap-calculus-bc",
      "stem": "In logistic growth $\\frac{dP}{dt} = 0.05 P (1 - \\frac{P}{800})$, what is the carrying capacity $L$?",
      "options": [
        "$800$",
        "$400$",
        "$0.05$",
        "$40$"
      ],
      "correctIndex": 0,
      "explanation": "The standard logistic differential equation is $\\frac{dP}{dt} = kP(1 - \\frac{P}{L})$, where $L = 800$ is carrying capacity.",
      "difficulty": "Medium",
      "timeLimit": 45
    },
    {
      "id": "calc_bc_9",
      "subjectId": "ap-calculus-bc",
      "stem": "Evaluate $\\lim_{n \\to \\infty} \\left(1 + \\frac{2}{n}\\right)^n$.",
      "options": [
        "$e^2$",
        "$e$",
        "$2e$",
        "$\\infty$"
      ],
      "correctIndex": 0,
      "explanation": "The standard exponential limit formula is $\\lim_{n \\to \\infty} (1 + \\frac{k}{n})^n = e^k \\implies e^2$.",
      "difficulty": "Medium",
      "timeLimit": 45
    },
    {
      "id": "calc_bc_10",
      "subjectId": "ap-calculus-bc",
      "stem": "What is the sum of the convergent geometric series $\\sum_{n=0}^\\infty 3 \\left(\\frac{1}{4}\\right)^n$?",
      "options": [
        "$4$",
        "$3$",
        "$12$",
        "$1$"
      ],
      "correctIndex": 0,
      "explanation": "Sum $= \\frac{a}{1 - r} = \\frac{3}{1 - 1/4} = \\frac{3}{3/4} = 4$.",
      "difficulty": "Medium",
      "timeLimit": 45
    },
    {
      "id": "calc_bc_11",
      "subjectId": "ap-calculus-bc",
      "stem": "Euler method with step size $h = 0.5$ approximates $y(1)$ for $\\frac{dy}{dx} = x + y$ with $y(0) = 1$. What is $y(0.5)$?",
      "options": [
        "$1.5$",
        "$1.25$",
        "$2.0$",
        "$1.75$"
      ],
      "correctIndex": 0,
      "explanation": "$y(0.5) \\approx y(0) + h \\cdot f(0, 1) = 1 + 0.5(0 + 1) = 1.5$.",
      "difficulty": "Hard",
      "timeLimit": 60
    },
    {
      "id": "calc_bc_12",
      "subjectId": "ap-calculus-bc",
      "stem": "Find the slope $\\frac{dy}{dx}$ of the parametric curve $x(t) = \\cos(t), y(t) = \\sin(t)$ at $t = \\frac{\\pi}{4}$.",
      "options": [
        "$-1$",
        "$1$",
        "$0$",
        "Undefined"
      ],
      "correctIndex": 0,
      "explanation": "$\\frac{dy}{dx} = \\frac{y'(t)}{x'(t)} = \\frac{\\cos(t)}{-\\sin(t)} = -\\cot(t)$. At $t = \\pi/4$: $-\\cot(\\pi/4) = -1$.",
      "difficulty": "Hard",
      "timeLimit": 60
    },
    {
      "id": "calc_bc_13",
      "subjectId": "ap-calculus-bc",
      "stem": "What are the first three non-zero terms of the Taylor series for $e^{2x}$ centered at $x = 0$?",
      "options": [
        "$1 + 2x + 2x^2$",
        "$1 + 2x + 4x^2$",
        "$1 + x + x^2$",
        "$2 + 4x + 8x^2$"
      ],
      "correctIndex": 0,
      "explanation": "$e^{2x} = 1 + (2x) + \\frac{(2x)^2}{2!} = 1 + 2x + 2x^2$.",
      "difficulty": "Hard",
      "timeLimit": 60
    },
    {
      "id": "calc_bc_14",
      "subjectId": "ap-calculus-bc",
      "stem": "What is the length of the curve $y = \\frac{2}{3}x^{3/2}$ on $[0, 3]$?",
      "options": [
        "$\\frac{14}{3}$",
        "$4$",
        "$\\frac{16}{3}$",
        "$6$"
      ],
      "correctIndex": 0,
      "explanation": "$y' = x^{1/2} \\implies L = \\int_0^3 \\sqrt{1 + x} dx = [\\frac{2}{3}(1+x)^{3/2}]_0^3 = \\frac{2}{3}(8 - 1) = \\frac{14}{3}$.",
      "difficulty": "Hard",
      "timeLimit": 60
    },
    {
      "id": "calc_bc_15",
      "subjectId": "ap-calculus-bc",
      "stem": "For what values of $p$ does the series $\\sum_{n=2}^\\infty \\frac{1}{n (\\ln n)^p}$ converge?",
      "options": [
        "$p > 1$",
        "$p \\ge 1$",
        "$p < 1$",
        "All real $p$"
      ],
      "correctIndex": 0,
      "explanation": "Using substitution $u = \\ln n, du = \\frac{1}{n} dn$: $\\int_2^\\infty u^{-p} du$ converges strictly when $p > 1$.",
      "difficulty": "Hard",
      "timeLimit": 60
    }
  ],
  "ap-environmental-science": [
    {
      "id": "apes_1",
      "subjectId": "ap-environmental-science",
      "stem": "Which layer of the atmosphere contains the protective ozone layer that absorbs harmful solar UV-C and UV-B radiation?",
      "options": [
        "Troposphere",
        "Stratosphere",
        "Mesosphere",
        "Thermosphere"
      ],
      "correctIndex": 1,
      "explanation": "The stratospheric ozone layer (located ~15-35 km above Earth) absorbs over 97% of biologically damaging solar ultraviolet rays.",
      "difficulty": "Easy",
      "timeLimit": 30
    },
    {
      "id": "apes_2",
      "subjectId": "ap-environmental-science",
      "stem": "What ecological process causes excessive algae blooms followed by hypoxia and dead zones in aquatic ecosystems?",
      "options": [
        "Eutrophication",
        "Bioaccumulation",
        "Salinization",
        "Desertification"
      ],
      "correctIndex": 0,
      "explanation": "Agricultural runoff rich in nitrogen and phosphorus triggers rapid algal growth; decomposers consume dissolved oxygen during decay.",
      "difficulty": "Easy",
      "timeLimit": 30
    },
    {
      "id": "apes_3",
      "subjectId": "ap-environmental-science",
      "stem": "Which soil horizon is known as topsoil and contains the highest concentration of organic matter and humus?",
      "options": [
        "O Horizon",
        "A Horizon",
        "B Horizon",
        "C Horizon"
      ],
      "correctIndex": 1,
      "explanation": "The A horizon is topsoil, composed of weathered minerals mixed with dark, nutrient-rich organic humus.",
      "difficulty": "Easy",
      "timeLimit": 30
    },
    {
      "id": "apes_4",
      "subjectId": "ap-environmental-science",
      "stem": "Which of the following is a non-point source of water pollution?",
      "options": [
        "A chemical factory discharge pipe",
        "Agricultural fertilizer runoff across a watershed",
        "A municipal sewage treatment outfall",
        "An offshore oil refinery leak"
      ],
      "correctIndex": 1,
      "explanation": "Non-point source pollution originates from broad, diffuse areas rather than a single identifiable, confined conveyance.",
      "difficulty": "Easy",
      "timeLimit": 30
    },
    {
      "id": "apes_5",
      "subjectId": "ap-environmental-science",
      "stem": "In island biogeography theory (MacArthur & Wilson), which island exhibits the highest species equilibrium richness?",
      "options": [
        "Small island far from mainland",
        "Large island close to mainland",
        "Small island close to mainland",
        "Large island far from mainland"
      ],
      "correctIndex": 1,
      "explanation": "Large islands support lower extinction rates and proximity to mainland increases immigration colonization rates.",
      "difficulty": "Easy",
      "timeLimit": 30
    },
    {
      "id": "apes_6",
      "subjectId": "ap-environmental-science",
      "stem": "What primary greenhouse gas is released in substantial quantities from bovine livestock enteric fermentation and flooded rice paddies?",
      "options": [
        "Methane ($CH_4$)",
        "Sulfur dioxide ($SO_2$)",
        "Nitrous oxide ($N_2O$)",
        "Carbon monoxide ($CO$)"
      ],
      "correctIndex": 0,
      "explanation": "Methanogenic anaerobic archaea in ruminant animal digestive tracts and flooded wetland soils produce methane ($CH_4$).",
      "difficulty": "Medium",
      "timeLimit": 45
    },
    {
      "id": "apes_7",
      "subjectId": "ap-environmental-science",
      "stem": "A demographic transition model in Stage 2 (Transitional) is characterized by:",
      "options": [
        "High birth rate and rapidly declining death rate",
        "Low birth rate and low death rate",
        "High birth rate and high death rate",
        "Declining birth rate and rising death rate"
      ],
      "correctIndex": 0,
      "explanation": "Improved sanitation, nutrition, and medical care cause death rates to plummet while birth rates remain elevated, resulting in rapid population growth.",
      "difficulty": "Medium",
      "timeLimit": 45
    },
    {
      "id": "apes_8",
      "subjectId": "ap-environmental-science",
      "stem": "What international treaty successfully banned ozone-depleting chlorofluorocarbons (CFCs)?",
      "options": [
        "Kyoto Protocol",
        "Montreal Protocol",
        "Paris Climate Accord",
        "Ramsar Convention"
      ],
      "correctIndex": 1,
      "explanation": "The Montreal Protocol (1987) mandated the phase-out of CFCs and halons to protect the stratospheric ozone layer.",
      "difficulty": "Medium",
      "timeLimit": 45
    },
    {
      "id": "apes_9",
      "subjectId": "ap-environmental-science",
      "stem": "Net Primary Productivity (NPP) is mathematically calculated as:",
      "options": [
        "$\\text{GPP} - R$",
        "$\\text{GPP} + R$",
        "$\\text{GPP} \\times R$",
        "$\\frac{\\text{GPP}}{R}$"
      ],
      "correctIndex": 0,
      "explanation": "$\\text{NPP}$ represents net biomass stored by autotrophs after accounting for cellular respiration losses ($\\text{NPP} = \\text{GPP} - R$).",
      "difficulty": "Medium",
      "timeLimit": 45
    },
    {
      "id": "apes_10",
      "subjectId": "ap-environmental-science",
      "stem": "Which secondary air pollutant forms photochemical smog in the troposphere when NOx reacts with VOCs in sunlight?",
      "options": [
        "Ground-level ozone ($O_3$)",
        "Carbon dioxide ($CO_2$)",
        "Lead ($Pb$)",
        "Asbestos"
      ],
      "correctIndex": 0,
      "explanation": "Nitrogen oxides and volatile organic compounds undergo photochemical reactions in sunlight to generate toxic tropospheric ozone.",
      "difficulty": "Medium",
      "timeLimit": 45
    },
    {
      "id": "apes_11",
      "subjectId": "ap-environmental-science",
      "stem": "Ocean acidification is primarily driven by seawater absorbing elevated atmospheric:",
      "options": [
        "Carbon dioxide ($CO_2$)",
        "Methane ($CH_4$)",
        "Sulfuric acid",
        "Chlorine"
      ],
      "correctIndex": 0,
      "explanation": "Dissolved $CO_2$ reacts with $H_2O$ to form carbonic acid ($H_2CO_3$), lowering ocean pH and dissolving calcium carbonate shells.",
      "difficulty": "Hard",
      "timeLimit": 60
    },
    {
      "id": "apes_12",
      "subjectId": "ap-environmental-science",
      "stem": "Which renewable energy technology exploits subterranean heat reservoirs to produce electricity?",
      "options": [
        "Photovoltaic solar",
        "Geothermal energy",
        "Hydroelectric power",
        "Biomass gasification"
      ],
      "correctIndex": 1,
      "explanation": "Geothermal energy extracts steam or hot water from underground magma heated rock strata to spin electric turbines.",
      "difficulty": "Hard",
      "timeLimit": 60
    },
    {
      "id": "apes_13",
      "subjectId": "ap-environmental-science",
      "stem": "What type of survivorship curve is typical of humans and large mammals exhibiting high parental care?",
      "options": [
        "Type I",
        "Type II",
        "Type III",
        "Exponential"
      ],
      "correctIndex": 0,
      "explanation": "Type I curves show high survival probabilities throughout early and middle life, followed by rapid mortality in old age.",
      "difficulty": "Hard",
      "timeLimit": 60
    },
    {
      "id": "apes_14",
      "subjectId": "ap-environmental-science",
      "stem": "Which mining technique removes entire mountaintops using explosives to extract coal seams?",
      "options": [
        "Subsurface shaft mining",
        "Mountaintop removal mining",
        "Placer dredging",
        "In-situ leaching"
      ],
      "correctIndex": 1,
      "explanation": "Mountaintop removal is a form of surface strip mining that shears off mountain peaks and dumps overburden into adjacent valleys.",
      "difficulty": "Hard",
      "timeLimit": 60
    },
    {
      "id": "apes_15",
      "subjectId": "ap-environmental-science",
      "stem": "In a food web, toxins such as DDT and mercury exhibit biomagnification because they are:",
      "options": [
        "Water-soluble and rapidly excreted",
        "Fat-soluble and persistent in trophic tissue",
        "Broken down by plant enzymes",
        "Evaporated into the atmosphere"
      ],
      "correctIndex": 1,
      "explanation": "Lipophilic persistent pollutants accumulate in adipose tissue and concentrate exponentially at higher trophic predator levels.",
      "difficulty": "Hard",
      "timeLimit": 60
    }
  ],
  "ap-computer-science": [
    {
      "id": "csa_1",
      "subjectId": "ap-computer-science",
      "stem": "In Java, what keyword is used to inherit properties and methods from a superclass?",
      "options": [
        "implements",
        "extends",
        "inherits",
        "super"
      ],
      "correctIndex": 1,
      "explanation": "The `extends` keyword establishes an inheritance relationship where a subclass inherits non-private members of a superclass.",
      "difficulty": "Easy",
      "timeLimit": 30
    },
    {
      "id": "csa_2",
      "subjectId": "ap-computer-science",
      "stem": "What does `System.out.println(5 / 2);` output in Java?",
      "options": [
        "2.5",
        "2",
        "3",
        "Compilation Error"
      ],
      "correctIndex": 1,
      "explanation": "Integer division truncates any fractional decimal component, yielding `2`.",
      "difficulty": "Easy",
      "timeLimit": 30
    },
    {
      "id": "csa_3",
      "subjectId": "ap-computer-science",
      "stem": "Which method is used to determine the number of elements currently stored in an `ArrayList<String>`?",
      "options": [
        "length()",
        "length",
        "size()",
        "count()"
      ],
      "correctIndex": 2,
      "explanation": "`ArrayList` utilizes the `size()` method, while arrays use the `.length` field and Strings use `.length()`.",
      "difficulty": "Easy",
      "timeLimit": 30
    },
    {
      "id": "csa_4",
      "subjectId": "ap-computer-science",
      "stem": "What happens when you declare a variable as `static` inside a Java class?",
      "options": [
        "Each object instance maintains its own unique copy",
        "The variable is shared by all instances of the class",
        "The variable cannot be modified (immutable)",
        "The variable can only be accessed inside loops"
      ],
      "correctIndex": 1,
      "explanation": "A `static` variable belongs to the class itself and is shared across all instantiated objects.",
      "difficulty": "Easy",
      "timeLimit": 30
    },
    {
      "id": "csa_5",
      "subjectId": "ap-computer-science",
      "stem": "What is the return value of `\"APExam\".substring(2, 5)` in Java?",
      "options": [
        "\"Exam\"",
        "\"Exa\"",
        "\"PEx\"",
        "\"PExam\""
      ],
      "correctIndex": 1,
      "explanation": "`substring(beginIndex, endIndex)` includes `beginIndex` (2 is 'E') and excludes `endIndex` (indices 2, 3, 4 -> \"Exa\").",
      "difficulty": "Easy",
      "timeLimit": 30
    },
    {
      "id": "csa_6",
      "subjectId": "ap-computer-science",
      "stem": "In binary search of an array of 1,024 elements, what is the maximum number of comparisons required?",
      "options": [
        "10",
        "100",
        "512",
        "1024"
      ],
      "correctIndex": 0,
      "explanation": "Binary search runs in $O(\\log_2 n)$. $\\log_2(1024) = 10$ comparisons.",
      "difficulty": "Medium",
      "timeLimit": 45
    },
    {
      "id": "csa_7",
      "subjectId": "ap-computer-science",
      "stem": "Which boolean expression is equivalent to `!(a && b)` according to De Morgan's Laws?",
      "options": [
        "!a && !b",
        "!a || !b",
        "a || b",
        "!a == !b"
      ],
      "correctIndex": 1,
      "explanation": "De Morgan's Law states that negating a conjunction flips the operator to disjunction: `!(a && b) == (!a || !b)`.",
      "difficulty": "Medium",
      "timeLimit": 45
    },
    {
      "id": "csa_8",
      "subjectId": "ap-computer-science",
      "stem": "What exception is thrown when accessing index 5 of an array declared as `int[] arr = new int[5];`?",
      "options": [
        "NullPointerException",
        "ArrayIndexOutOfBoundsException",
        "IllegalArgumentException",
        "ClassCastException"
      ],
      "correctIndex": 1,
      "explanation": "A 5-element array has valid indices 0 to 4. Index 5 triggers an `ArrayIndexOutOfBoundsException`.",
      "difficulty": "Medium",
      "timeLimit": 45
    },
    {
      "id": "csa_9",
      "subjectId": "ap-computer-science",
      "stem": "What is polymorphism in Java OOP?",
      "options": [
        "Hiding private instance variables",
        "Allowing an object reference of a parent type to invoke overridden child methods at runtime",
        "Compiling bytecode into machine native code",
        "Allocating heap memory automatically"
      ],
      "correctIndex": 1,
      "explanation": "Polymorphism enables dynamic method dispatch where overridden subclass methods are executed via superclass references.",
      "difficulty": "Medium",
      "timeLimit": 45
    },
    {
      "id": "csa_10",
      "subjectId": "ap-computer-science",
      "stem": "What does `str1.equals(str2)` test for in Java?",
      "options": [
        "If both variables point to the exact same memory address",
        "If both strings contain the identical character sequence",
        "If str1 is alphabetically before str2",
        "If both strings have equal lengths"
      ],
      "correctIndex": 1,
      "explanation": "`.equals()` tests semantic content equality, while `==` compares reference memory addresses.",
      "difficulty": "Medium",
      "timeLimit": 45
    },
    {
      "id": "csa_11",
      "subjectId": "ap-computer-science",
      "stem": "What is the base case in a recursive method?",
      "options": [
        "The initial call made from the main method",
        "The terminating condition that halts further recursive calls",
        "The deepest stack frame before memory overflow",
        "A loop that repeats inside the method"
      ],
      "correctIndex": 1,
      "explanation": "A recursive method must contain a base case to terminate recursion and prevent stack overflow errors.",
      "difficulty": "Hard",
      "timeLimit": 60
    },
    {
      "id": "csa_12",
      "subjectId": "ap-computer-science",
      "stem": "What is the worst-case time complexity of Selection Sort on an array of $n$ elements?",
      "options": [
        "$O(1)$",
        "$O(\\log n)$",
        "$O(n)$",
        "$O(n^2)$"
      ],
      "correctIndex": 3,
      "explanation": "Selection Sort always executes nested comparison loops requiring $\\frac{n(n-1)}{2}$ operations, giving $O(n^2)$ complexity.",
      "difficulty": "Hard",
      "timeLimit": 60
    },
    {
      "id": "csa_13",
      "subjectId": "ap-computer-science",
      "stem": "How do you access the number of rows in a 2D array `int[][] matrix`?",
      "options": [
        "matrix.length",
        "matrix[0].length",
        "matrix.size()",
        "matrix.rows"
      ],
      "correctIndex": 0,
      "explanation": "`matrix.length` represents the number of rows, while `matrix[0].length` gives column count.",
      "difficulty": "Hard",
      "timeLimit": 60
    },
    {
      "id": "csa_14",
      "subjectId": "ap-computer-science",
      "stem": "What keyword in a constructor invokes the superclass constructor?",
      "options": [
        "this()",
        "super()",
        "parent()",
        "base()"
      ],
      "correctIndex": 1,
      "explanation": "`super()` calls the superclass constructor and must be the first statement in the subclass constructor.",
      "difficulty": "Hard",
      "timeLimit": 60
    },
    {
      "id": "csa_15",
      "subjectId": "ap-computer-science",
      "stem": "What does the wrapper class `Integer.parseInt(\"42\")` return?",
      "options": [
        "A primitive `int` value 42",
        "A String \"42\"",
        "A double 42.0",
        "A null reference"
      ],
      "correctIndex": 0,
      "explanation": "`Integer.parseInt()` parses a String into its corresponding primitive `int` representation.",
      "difficulty": "Hard",
      "timeLimit": 60
    }
  ],
  "ap-world-history": [
    {
      "id": "wh_1",
      "subjectId": "ap-world-history",
      "stem": "The Silk Roads facilitated extensive Afro-Eurasian trade primarily connecting China with:",
      "options": [
        "The Mediterranean basin",
        "Mesoamerica",
        "Sub-Saharan West Africa",
        "Polynesian islands"
      ],
      "correctIndex": 0,
      "explanation": "The ancient and medieval Silk Roads linked Chang'an in China through Central Asia directly to Mediterranean and European markets.",
      "difficulty": "Easy",
      "timeLimit": 30
    },
    {
      "id": "wh_2",
      "subjectId": "ap-world-history",
      "stem": "Which pastoral empire unified the largest contiguous land empire in world history during the 13th century?",
      "options": [
        "The Ottoman Empire",
        "The Mongol Empire",
        "The Mughal Empire",
        "The Songhai Empire"
      ],
      "correctIndex": 1,
      "explanation": "Under Genghis Khan and his successors, the Mongol Empire spanned from East Asia to Eastern Europe, establishing the Pax Mongolica.",
      "difficulty": "Easy",
      "timeLimit": 30
    },
    {
      "id": "wh_3",
      "subjectId": "ap-world-history",
      "stem": "The Columbian Exchange refers to the unprecedented transoceanic transfer of:",
      "options": [
        "Plants, animals, diseases, and cultures between the Eastern and Western Hemispheres",
        "Gold bullion exclusively between Britain and India",
        "Enslaved laborers solely across the Indian Ocean",
        "Manufactured goods between Japan and Portugal"
      ],
      "correctIndex": 0,
      "explanation": "Post-1492 voyages connected the Old and New Worlds, transferring crops (potatoes, maize), livestock, and lethal epidemics (smallpox).",
      "difficulty": "Easy",
      "timeLimit": 30
    },
    {
      "id": "wh_4",
      "subjectId": "ap-world-history",
      "stem": "The Ottoman devshirme system recruited Christian youth from the Balkans to train as elite soldiers known as:",
      "options": [
        "Janissaries",
        "Mamluks",
        "Samurai",
        "Cossacks"
      ],
      "correctIndex": 0,
      "explanation": "The devshirme conscripted Christian boys who converted to Islam and served as the sultan's elite Janissary military corps and administrators.",
      "difficulty": "Easy",
      "timeLimit": 30
    },
    {
      "id": "wh_5",
      "subjectId": "ap-world-history",
      "stem": "Where did the First Industrial Revolution originate in the mid-18th century?",
      "options": [
        "Great Britain",
        "France",
        "United States",
        "Germany"
      ],
      "correctIndex": 0,
      "explanation": "Abundant coal deposits, iron ore, colonial capital, commercial canals, and patent protections sparked Britain's industrial takeoff.",
      "difficulty": "Easy",
      "timeLimit": 30
    },
    {
      "id": "wh_6",
      "subjectId": "ap-world-history",
      "stem": "The 1884-1885 Berlin Conference convened European powers to formally coordinate the:",
      "options": [
        "Scramble for Africa",
        "Partition of the Ottoman Empire",
        "Colonization of South America",
        "Alliances of World War I"
      ],
      "correctIndex": 0,
      "explanation": "Organized by Otto von Bismarck, the conference divided the African continent among European imperial powers without African representation.",
      "difficulty": "Medium",
      "timeLimit": 45
    },
    {
      "id": "wh_7",
      "subjectId": "ap-world-history",
      "stem": "Which 1917 political revolution toppled the Russian Romanov dynasty and established a Bolshevik communist state?",
      "options": [
        "The Russian Revolution",
        "The Boxer Rebellion",
        "The Meiji Restoration",
        "The Taiping Rebellion"
      ],
      "correctIndex": 0,
      "explanation": "Led by Vladimir Lenin, the Bolsheviks seized state power in October 1917, withdrawing Russia from WWI and founding the Soviet Union.",
      "difficulty": "Medium",
      "timeLimit": 45
    },
    {
      "id": "wh_8",
      "subjectId": "ap-world-history",
      "stem": "The Meiji Restoration (1868) in Japan was initiated primarily to:",
      "options": [
        "Rapidly modernize and industrialize Japan to avoid Western colonial domination",
        "Expel all foreign merchants and practice complete isolationism",
        "Restore the Tokugawa Shogunate feudal military rule",
        "Conquer the Korean peninsula immediately"
      ],
      "correctIndex": 0,
      "explanation": "Japan centralized political authority under Emperor Meiji, adopting Western industrial technology, education, and modern naval defense.",
      "difficulty": "Medium",
      "timeLimit": 45
    },
    {
      "id": "wh_9",
      "subjectId": "ap-world-history",
      "stem": "Which 16th-century religious movement initiated by Martin Luther fragmented Catholic ecclesiastical hegemony in Europe?",
      "options": [
        "The Protestant Reformation",
        "The Counter-Reformation",
        "The Great Schism",
        "The Enlightenment"
      ],
      "correctIndex": 0,
      "explanation": "Martin Luther's 1517 Ninety-Five Theses opposed clerical indulgences, sparking the rise of Protestant churches across Europe.",
      "difficulty": "Medium",
      "timeLimit": 45
    },
    {
      "id": "wh_10",
      "subjectId": "ap-world-history",
      "stem": "The trans-Saharan trade network in medieval West Africa was anchored on the exchange of:",
      "options": [
        "Gold and salt",
        "Silk and porcelain",
        "Silver and spices",
        "Timber and furs"
      ],
      "correctIndex": 0,
      "explanation": "Gold from West African kingdoms (Ghana, Mali) was traded across the Sahara desert for Saharan rock salt and Mediterranean manufactures.",
      "difficulty": "Medium",
      "timeLimit": 45
    },
    {
      "id": "wh_11",
      "subjectId": "ap-world-history",
      "stem": "What maritime navigational instrument, originally refined by Islamic scholars, allowed sailors to measure latitude by celestial altitude?",
      "options": [
        "Astrolabe",
        "Barometer",
        "Chronometer",
        "Seismograph"
      ],
      "correctIndex": 0,
      "explanation": "The astrolabe enabled navigators to determine local latitude at sea by measuring the angle of the sun or Polaris above the horizon.",
      "difficulty": "Hard",
      "timeLimit": 60
    },
    {
      "id": "wh_12",
      "subjectId": "ap-world-history",
      "stem": "The Qing Dynasty enforced which distinctive physical mandate on ethnic Han men to symbolize submission to Manchu rule?",
      "options": [
        "The queue hairstyle (shaved forehead and braided pigtail)",
        "Mandatory foot-binding",
        "Tattooing clan seals",
        "Wearing samurai armor"
      ],
      "correctIndex": 0,
      "explanation": "The Queue Order decreed that all Han Chinese men adopt the Manchu hairstyle under penalty of death (\"lose your hair or lose your head\").",
      "difficulty": "Hard",
      "timeLimit": 60
    },
    {
      "id": "wh_13",
      "subjectId": "ap-world-history",
      "stem": "Which Indian leader championed satyagraha (nonviolent civil disobedience) to achieve independence from British colonial rule?",
      "options": [
        "Mahatma Gandhi",
        "Jawaharlal Nehru",
        "Subhas Chandra Bose",
        "Muhammad Ali Jinnah"
      ],
      "correctIndex": 0,
      "explanation": "Mohandas Gandhi organized nonviolent campaigns including the Salt March that dismantled the British Raj in 1947.",
      "difficulty": "Hard",
      "timeLimit": 60
    },
    {
      "id": "wh_14",
      "subjectId": "ap-world-history",
      "stem": "The Cold War was primarily an ideological and geopolitical confrontation between which two superpowers?",
      "options": [
        "The United States and the Soviet Union",
        "Great Britain and France",
        "China and Japan",
        "Germany and Russia"
      ],
      "correctIndex": 0,
      "explanation": "The post-WWII era pitted the democratic capitalist US against the authoritarian Marxist-Leninist USSR in proxy wars and an arms race.",
      "difficulty": "Hard",
      "timeLimit": 60
    },
    {
      "id": "wh_15",
      "subjectId": "ap-world-history",
      "stem": "The Encomienda system in colonial Spanish America was established to:",
      "options": [
        "Extract forced agricultural and silver mining labor from indigenous populations",
        "Distribute free land to native tribes",
        "Enforce religious freedom for Jewish immigrants",
        "Establish democratic municipal councils"
      ],
      "correctIndex": 0,
      "explanation": "Spanish conquistadors were granted royal encomiendas entitling them to coercive indigenous tributary labor in exchange for Catholic instruction.",
      "difficulty": "Hard",
      "timeLimit": 60
    }
  ],
  "ap-human-geography": [
    {
      "id": "hg_1",
      "subjectId": "ap-human-geography",
      "stem": "According to the Demographic Transition Model (DTM), what distinguishes Stage 4 from Stage 1?",
      "options": [
        "Stage 4 has low birth and death rates, whereas Stage 1 has high birth and death rates",
        "Stage 4 has explosive natural increase rates",
        "Stage 1 has widespread mechanized medical infrastructure",
        "Stage 4 has higher infant mortality rates"
      ],
      "correctIndex": 0,
      "explanation": "Both stages exhibit slow population growth, but Stage 1 is high fluctuating while Stage 4 is low fluctuating (modern industrialized).",
      "difficulty": "Easy",
      "timeLimit": 30
    },
    {
      "id": "hg_2",
      "subjectId": "ap-human-geography",
      "stem": "The Von Thunen model predicts that dairy and perishable market gardening will locate in the ring closest to the market city because:",
      "options": [
        "Milk and fresh produce spoil rapidly and incur high transportation costs",
        "Dairy cattle require vast, inexpensive grazing land",
        "Firewood is cheaper to produce near rivers",
        "Grain requires continuous urban labor"
      ],
      "correctIndex": 0,
      "explanation": "Perishability and high transit costs force intensive market gardening and dairying to pay higher land rent closest to the central market.",
      "difficulty": "Easy",
      "timeLimit": 30
    },
    {
      "id": "hg_3",
      "subjectId": "ap-human-geography",
      "stem": "What type of spatial diffusion occurs when an innovation spreads through a hierarchy of urban centers from large to smaller cities?",
      "options": [
        "Hierarchical diffusion",
        "Contagious diffusion",
        "Stimulus diffusion",
        "Relocation diffusion"
      ],
      "correctIndex": 0,
      "explanation": "Hierarchical diffusion cascades ideas through ranks of importance (e.g. fashion spreading from Paris and NYC to smaller regional towns).",
      "difficulty": "Easy",
      "timeLimit": 30
    },
    {
      "id": "hg_4",
      "subjectId": "ap-human-geography",
      "stem": "In political geography, what is a stateless nation?",
      "options": [
        "An ethnic group possessing cultural identity and historical homeland without sovereign state territory (e.g. Kurds)",
        "A sovereign state without an army",
        "A multinational empire like the former Soviet Union",
        "A newly independent colony"
      ],
      "correctIndex": 0,
      "explanation": "Stateless nations (such as the Kurds, Palestinians, or Basques) possess shared cultural self-determination without political sovereignty.",
      "difficulty": "Easy",
      "timeLimit": 30
    },
    {
      "id": "hg_5",
      "subjectId": "ap-human-geography",
      "stem": "Thomas Malthus warned in 1798 that human population increases exponentially while food production increases:",
      "options": [
        "Arithmetically (linearly)",
        "Logarithmically",
        "Exponentially faster",
        "Negatively"
      ],
      "correctIndex": 0,
      "explanation": "Malthusian theory posited that geometric (exponential) population growth would outstrip arithmetic agricultural yield growth.",
      "difficulty": "Easy",
      "timeLimit": 30
    },
    {
      "id": "hg_6",
      "subjectId": "ap-human-geography",
      "stem": "In Walter Christaller Central Place Theory, market service areas are modeled as interlocking:",
      "options": [
        "Hexagons",
        "Circles",
        "Squares",
        "Triangles"
      ],
      "correctIndex": 0,
      "explanation": "Hexagons eliminate overlapping service areas and unserved interstitial gaps while maintaining equidistant accessibility.",
      "difficulty": "Medium",
      "timeLimit": 45
    },
    {
      "id": "hg_7",
      "subjectId": "ap-human-geography",
      "stem": "What term describes the boundary separating different linguistic features, such as regional pronunciation or vocabulary usage?",
      "options": [
        "Isohyet",
        "Isogloss",
        "Isotherm",
        "Enclave"
      ],
      "correctIndex": 1,
      "explanation": "An isogloss is a geographic boundary line demarcating areas where specific linguistic terms or dialect traits are predominant.",
      "difficulty": "Medium",
      "timeLimit": 45
    },
    {
      "id": "hg_8",
      "subjectId": "ap-human-geography",
      "stem": "Which global religion is classified as ethnic rather than universalizing?",
      "options": [
        "Hinduism",
        "Christianity",
        "Islam",
        "Buddhism"
      ],
      "correctIndex": 0,
      "explanation": "Ethnic religions (such as Hinduism and Judaism) are closely tied to a specific culture and geographic homeland, with no active proselytization.",
      "difficulty": "Medium",
      "timeLimit": 45
    },
    {
      "id": "hg_9",
      "subjectId": "ap-human-geography",
      "stem": "Gerrymandering refers to the political practice of:",
      "options": [
        "Redrawing electoral district boundaries to benefit a specific political party",
        "Counting undocumented migrants in the decennial census",
        "Merging rural municipalities into mega-cities",
        "Banning international trade tariffs"
      ],
      "correctIndex": 0,
      "explanation": "Gerrymandering strategically packs or cracks opposing voters across congressional districts to maximize party representation.",
      "difficulty": "Medium",
      "timeLimit": 45
    },
    {
      "id": "hg_10",
      "subjectId": "ap-human-geography",
      "stem": "Wallerstein World Systems Theory categorizes nations into which three spatial economic tiers?",
      "options": [
        "Core, Periphery, and Semi-Periphery",
        "First, Second, and Third Worlds",
        "Developed, Developing, and Underdeveloped",
        "Northern, Southern, and Tropical"
      ],
      "correctIndex": 0,
      "explanation": "Core states exploit lower-wage labor and raw materials from periphery states, while semi-periphery states exhibit intermediate industrialization.",
      "difficulty": "Medium",
      "timeLimit": 45
    },
    {
      "id": "hg_11",
      "subjectId": "ap-human-geography",
      "stem": "The Burgess Concentric Zone urban model depicts a central business district (CBD) encircled primarily by:",
      "options": [
        "A zone of transition with light manufacturing and tenement housing",
        "Affluent commuter suburbs",
        "Agricultural farmland",
        "Exclusive gated estates"
      ],
      "correctIndex": 0,
      "explanation": "Zone 2 in Burgess concentric model is the transitional zone characterized by decaying residential housing and light industrial expansion.",
      "difficulty": "Hard",
      "timeLimit": 60
    },
    {
      "id": "hg_12",
      "subjectId": "ap-human-geography",
      "stem": "The Green Revolution of the mid-20th century substantially increased global grain yields through:",
      "options": [
        "Genetically engineered high-yielding variety (HYV) dwarf seeds, synthetic fertilizers, and mechanized irrigation",
        "Organic permaculture and heirloom seed preservation",
        "Shifting cultivation and slash-and-burn farming",
        "Banning chemical pesticides worldwide"
      ],
      "correctIndex": 0,
      "explanation": "Norman Borlaug introduced disease-resistant dwarf wheat and rice paired with synthetic nitrogen fertilizers and irrigation systems.",
      "difficulty": "Hard",
      "timeLimit": 60
    },
    {
      "id": "hg_13",
      "subjectId": "ap-human-geography",
      "stem": "Which migration factor represents a 'pull' factor?",
      "options": [
        "Economic job opportunities and high wages",
        "War and military conscription",
        "Religious persecution",
        "Severe famine and crop failure"
      ],
      "correctIndex": 0,
      "explanation": "Pull factors attract migrants to a destination (e.g. employment, peace, freedom), whereas push factors compel departure.",
      "difficulty": "Hard",
      "timeLimit": 60
    },
    {
      "id": "hg_14",
      "subjectId": "ap-human-geography",
      "stem": "A country where the population pyramid exhibits an expansive, wide base and narrow apex has:",
      "options": [
        "A high birth rate and a youthful population",
        "An aging population with declining birth rates",
        "Zero population growth",
        "Negative natural increase"
      ],
      "correctIndex": 0,
      "explanation": "A broad pyramid base indicates high birth rates and rapid demographic growth typical of developing nations in DTM Stage 2.",
      "difficulty": "Hard",
      "timeLimit": 60
    },
    {
      "id": "hg_15",
      "subjectId": "ap-human-geography",
      "stem": "According to Ravenstein Laws of Migration, the majority of migrants travel:",
      "options": [
        "Short distances and remain within their home country",
        "Intercontinentally across oceans",
        "Exclusively from urban to rural areas",
        "Directly to polar regions"
      ],
      "correctIndex": 0,
      "explanation": "Ravenstein observed that step-migration and short-distance moves represent the overwhelming majority of voluntary human migration.",
      "difficulty": "Hard",
      "timeLimit": 60
    }
  ],
  "ap-economics": [
    {
      "id": "econ_1",
      "subjectId": "ap-economics",
      "stem": "If the price of a good increases by 10% and the quantity demanded falls by 20%, the price elasticity of demand is:",
      "options": [
        "Elastic ($E_d = 2.0$)",
        "Inelastic ($E_d = 0.5$)",
        "Unitary Elastic ($E_d = 1.0$)",
        "Perfective Inelastic ($E_d = 0$)"
      ],
      "correctIndex": 0,
      "explanation": "$E_d = |\\frac{\\% \\Delta Q_d}{\\% \\Delta P}| = |\\frac{-20\\%}{10\\%}| = 2.0$. Since $E_d > 1$, demand is price elastic.",
      "difficulty": "Easy",
      "timeLimit": 30
    },
    {
      "id": "econ_2",
      "subjectId": "ap-economics",
      "stem": "What occurs when the government establishes a legally mandated price ceiling below the competitive market equilibrium price?",
      "options": [
        "A persistent market shortage",
        "A market surplus",
        "Equilibrium quantity increases",
        "No change occurs in the market"
      ],
      "correctIndex": 0,
      "explanation": "When price is artificially capped below equilibrium, quantity demanded ($Q_d$) exceeds quantity supplied ($Q_s$), causing a shortage.",
      "difficulty": "Easy",
      "timeLimit": 30
    },
    {
      "id": "econ_3",
      "subjectId": "ap-economics",
      "stem": "In macroeconomics, expansionary fiscal policy intended to combat an economic recession involves:",
      "options": [
        "Increasing government spending and/or reducing taxes",
        "Increasing taxes and reducing spending",
        "Raising the central bank discount rate",
        "Selling government bonds in open market operations"
      ],
      "correctIndex": 0,
      "explanation": "Expansionary fiscal policy boosts aggregate demand by injecting federal expenditure or increasing household disposable income via tax cuts.",
      "difficulty": "Easy",
      "timeLimit": 30
    },
    {
      "id": "econ_4",
      "subjectId": "ap-economics",
      "stem": "If the reserve requirement set by the central bank is 10%, what is the simple money multiplier?",
      "options": [
        "$10$",
        "$5$",
        "$20$",
        "$1$"
      ],
      "correctIndex": 0,
      "explanation": "The simple deposit expansion multiplier is $M = \\frac{1}{\\text{Reserve Ratio}} = \\frac{1}{0.10} = 10$.",
      "difficulty": "Easy",
      "timeLimit": 30
    },
    {
      "id": "econ_5",
      "subjectId": "ap-economics",
      "stem": "Country A can produce 10 cars or 20 computers. Country B can produce 6 cars or 18 computers. Who holds the comparative advantage in computers?",
      "options": [
        "Country B",
        "Country A",
        "Both equally",
        "Neither country"
      ],
      "correctIndex": 0,
      "explanation": "Opportunity cost of 1 computer for A is $10/20 = 0.5$ cars. For B, it is $6/18 = 0.33$ cars. Country B has the lower opportunity cost in computers.",
      "difficulty": "Easy",
      "timeLimit": 30
    },
    {
      "id": "econ_6",
      "subjectId": "ap-economics",
      "stem": "What type of market structure features a single seller with high barriers to entry and no close product substitutes?",
      "options": [
        "Monopoly",
        "Perfect Competition",
        "Monopolistic Competition",
        "Oligopoly"
      ],
      "correctIndex": 0,
      "explanation": "A pure monopoly is characterized by a single firm that controls the entire market supply and faces a downward-sloping demand curve.",
      "difficulty": "Medium",
      "timeLimit": 45
    },
    {
      "id": "econ_7",
      "subjectId": "ap-economics",
      "stem": "A negative externality in production (such as factory smoke pollution) causes the unregulated free market to:",
      "options": [
        "Overproduce the good relative to the socially optimal quantity",
        "Underproduce the good",
        "Produce at zero cost",
        "Reach social optimum automatically"
      ],
      "correctIndex": 0,
      "explanation": "Because private marginal cost is lower than marginal social cost ($MSC > MPC$), firms overproduce, creating deadweight loss.",
      "difficulty": "Medium",
      "timeLimit": 45
    },
    {
      "id": "econ_8",
      "subjectId": "ap-economics",
      "stem": "What does Gross Domestic Product (GDP) measure?",
      "options": [
        "The total market value of all final goods and services produced within a country in a given year",
        "The total financial wealth of all households and banks",
        "The value of intermediate goods exported abroad",
        "The total income earned by multinational citizens overseas"
      ],
      "correctIndex": 0,
      "explanation": "GDP encompasses the monetary value of all finished, final goods and services produced domestically within geographic borders in a specified period.",
      "difficulty": "Medium",
      "timeLimit": 45
    },
    {
      "id": "econ_9",
      "subjectId": "ap-economics",
      "stem": "A profit-maximizing firm in any market structure expands output until:",
      "options": [
        "Marginal Revenue equals Marginal Cost ($MR = MC$)",
        "Price equals Average Total Cost",
        "Total Revenue is maximized",
        "Marginal Cost is minimized"
      ],
      "correctIndex": 0,
      "explanation": "The golden rule of profit maximization dictates producing up to the output level where marginal revenue equals marginal cost ($MR = MC$).",
      "difficulty": "Medium",
      "timeLimit": 45
    },
    {
      "id": "econ_10",
      "subjectId": "ap-economics",
      "stem": "The Phillips Curve in the short run illustrates a historical trade-off between:",
      "options": [
        "Inflation and unemployment",
        "Interest rates and GDP growth",
        "Government debt and trade deficits",
        "Taxes and investment"
      ],
      "correctIndex": 0,
      "explanation": "The short-run Phillips curve demonstrates an inverse relationship: lower unemployment rates are typically associated with higher inflation rates.",
      "difficulty": "Medium",
      "timeLimit": 45
    },
    {
      "id": "econ_11",
      "subjectId": "ap-economics",
      "stem": "What type of unemployment occurs when workers are temporarily between jobs or searching for the best career fit?",
      "options": [
        "Frictional unemployment",
        "Structural unemployment",
        "Cyclical unemployment",
        "Seasonal unemployment"
      ],
      "correctIndex": 0,
      "explanation": "Frictional unemployment is voluntary and natural, reflecting the normal time lag workers spend transitioning between careers.",
      "difficulty": "Hard",
      "timeLimit": 60
    },
    {
      "id": "econ_12",
      "subjectId": "ap-economics",
      "stem": "Consumer surplus is represented graphically as the area:",
      "options": [
        "Below the demand curve and above the market price",
        "Above the supply curve and below the market price",
        "Under the average total cost curve",
        "To the right of the equilibrium quantity"
      ],
      "correctIndex": 0,
      "explanation": "Consumer surplus is the difference between what consumers are willing to pay and what they actually pay at market price.",
      "difficulty": "Hard",
      "timeLimit": 60
    },
    {
      "id": "econ_13",
      "subjectId": "ap-economics",
      "stem": "When the central bank purchases government treasury bonds on the open market, what is the impact on bank reserves and interest rates?",
      "options": [
        "Bank reserves increase, and nominal interest rates fall",
        "Bank reserves decrease, and interest rates rise",
        "Bank reserves fall, and inflation drops",
        "No change occurs"
      ],
      "correctIndex": 0,
      "explanation": "Open market bond purchases inject liquid reserves into the commercial banking system, shifting money supply right and lowering interest rates.",
      "difficulty": "Hard",
      "timeLimit": 60
    },
    {
      "id": "econ_14",
      "subjectId": "ap-economics",
      "stem": "Public goods are characterized by which two economic properties?",
      "options": [
        "Non-excludable and non-rivalrous in consumption",
        "Excludable and rivalrous",
        "Produced solely by monopolies",
        "Tax-exempt and subsidized"
      ],
      "correctIndex": 0,
      "explanation": "Public goods (e.g. national defense, lighthouses) cannot exclude non-payers, and one person's use does not diminish another's.",
      "difficulty": "Hard",
      "timeLimit": 60
    },
    {
      "id": "econ_15",
      "subjectId": "ap-economics",
      "stem": "If the Marginal Propensity to Consume (MPC) is 0.8, what is the government spending multiplier?",
      "options": [
        "$5$",
        "$1.25$",
        "$4$",
        "$10$"
      ],
      "correctIndex": 0,
      "explanation": "Spending Multiplier $= \\frac{1}{1 - MPC} = \\frac{1}{1 - 0.8} = \\frac{1}{0.2} = 5$.",
      "difficulty": "Hard",
      "timeLimit": 60
    }
  ],
  "ap-english-lang": [
    {
      "id": "lang_1",
      "subjectId": "ap-english-lang",
      "stem": "An appeal that establishes the author's credibility, moral character, and authority is known as:",
      "options": [
        "Ethos",
        "Pathos",
        "Logos",
        "Kairos"
      ],
      "correctIndex": 0,
      "explanation": "Ethos appeals to ethics, trust, and authorial qualifications to persuade an audience of the speaker's reliability.",
      "difficulty": "Easy",
      "timeLimit": 30
    },
    {
      "id": "lang_2",
      "subjectId": "ap-english-lang",
      "stem": "What rhetorical device balances grammatical structures across corresponding clauses (e.g. \"Ask not what your country can do for you...\")?",
      "options": [
        "Parallelism",
        "Chiasmus",
        "Anaphora",
        "Asyndeton"
      ],
      "correctIndex": 0,
      "explanation": "Parallelism utilizes repeating grammatical forms to emphasize balance, rhythm, and clarity in rhetorical argumentation.",
      "difficulty": "Easy",
      "timeLimit": 30
    },
    {
      "id": "lang_3",
      "subjectId": "ap-english-lang",
      "stem": "The logical fallacy where an arguer attacks an opponent's personal character rather than addressing their actual argument is called:",
      "options": [
        "Ad Hominem",
        "Straw Man",
        "Post Hoc Ergo Propter Hoc",
        "Bandwagon Appeal"
      ],
      "correctIndex": 0,
      "explanation": "Ad Hominem (Latin: \"to the person\") diverts attention from the substantive debate by personally maligning the speaker.",
      "difficulty": "Easy",
      "timeLimit": 30
    },
    {
      "id": "lang_4",
      "subjectId": "ap-english-lang",
      "stem": "What term refers to the author's attitude toward their subject matter, conveyed through diction and syntax?",
      "options": [
        "Tone",
        "Mood",
        "Theme",
        "Persona"
      ],
      "correctIndex": 0,
      "explanation": "Tone reflects the writer's specific emotional disposition (e.g. irreverent, pedantic, contemplative) towards the topic.",
      "difficulty": "Easy",
      "timeLimit": 30
    },
    {
      "id": "lang_5",
      "subjectId": "ap-english-lang",
      "stem": "Which rhetorical appeal utilizes logical reasoning, factual evidence, empirical statistics, and deductions?",
      "options": [
        "Logos",
        "Ethos",
        "Pathos",
        "Trope"
      ],
      "correctIndex": 0,
      "explanation": "Logos employs rational syllogisms, inductive/deductive reasoning, verified data, and factual premises.",
      "difficulty": "Easy",
      "timeLimit": 30
    },
    {
      "id": "lang_6",
      "subjectId": "ap-english-lang",
      "stem": "The deliberate repetition of a word or phrase at the beginning of successive sentences or clauses is known as:",
      "options": [
        "Anaphora",
        "Epistrophe",
        "Antithesis",
        "Metonymy"
      ],
      "correctIndex": 0,
      "explanation": "Anaphora creates emphatic emotional resonance through initial clause repetition (e.g. MLK's \"I have a dream\").",
      "difficulty": "Medium",
      "timeLimit": 45
    },
    {
      "id": "lang_7",
      "subjectId": "ap-english-lang",
      "stem": "In an argumentative essay, acknowledging a valid point made by the opposing viewpoint is called a:",
      "options": [
        "Concession",
        "Rebuttal",
        "Warrant",
        "Qualifier"
      ],
      "correctIndex": 0,
      "explanation": "A concession demonstrates rhetorical maturity by admitting truth in a counterargument before delivering a rebuttal.",
      "difficulty": "Medium",
      "timeLimit": 45
    },
    {
      "id": "lang_8",
      "subjectId": "ap-english-lang",
      "stem": "What rhetorical term describes the opportune, fitting, and urgent moment for a speaker to deliver a message?",
      "options": [
        "Kairos",
        "Exigence",
        "Peroration",
        "Inventio"
      ],
      "correctIndex": 0,
      "explanation": "Kairos represents the decisive, opportune timing and cultural moment that gives rhetorical discourse its urgency.",
      "difficulty": "Medium",
      "timeLimit": 45
    },
    {
      "id": "lang_9",
      "subjectId": "ap-english-lang",
      "stem": "A figure of speech in which an object or concept is referred to by the name of something closely associated with it (e.g. \"The White House announced...\") is:",
      "options": [
        "Metonymy",
        "Synecdoche",
        "Hyperbole",
        "Oxymoron"
      ],
      "correctIndex": 0,
      "explanation": "Metonymy substitutes a related attribute or physical association for the entity itself (\"the crown\" for the monarchy).",
      "difficulty": "Medium",
      "timeLimit": 45
    },
    {
      "id": "lang_10",
      "subjectId": "ap-english-lang",
      "stem": "What is the function of a qualifier in the Toulmin model of argumentation?",
      "options": [
        "To restrict the scope of a claim to avoid unwarranted generalizations (e.g. \"most\", \"often\", \"in certain conditions\")",
        "To provide statistical data",
        "To attack the opponent's credibility",
        "To conclude the speech"
      ],
      "correctIndex": 0,
      "explanation": "Qualifiers temper claims to reasonable, defensible boundaries, preventing rigid all-or-nothing fallacies.",
      "difficulty": "Medium",
      "timeLimit": 45
    },
    {
      "id": "lang_11",
      "subjectId": "ap-english-lang",
      "stem": "Understatement, especially that in which an affirmative is expressed by the negative of its contrary (e.g. \"not bad at all\"), is called:",
      "options": [
        "Litotes",
        "Euphemism",
        "Apostrophe",
        "Paradox"
      ],
      "correctIndex": 0,
      "explanation": "Litotes employs deliberate double negatives or ironic understatements to assert a positive quality modestly.",
      "difficulty": "Hard",
      "timeLimit": 60
    },
    {
      "id": "lang_12",
      "subjectId": "ap-english-lang",
      "stem": "What rhetorical device juxtaposes two sharply contrasting ideas in balanced phrases (e.g. \"Give me liberty, or give me death!\")?",
      "options": [
        "Antithesis",
        "Hyperbole",
        "Personification",
        "Zeugma"
      ],
      "correctIndex": 0,
      "explanation": "Antithesis highlights stark philosophical or emotional opposition through balanced syntactic contrast.",
      "difficulty": "Hard",
      "timeLimit": 60
    },
    {
      "id": "lang_13",
      "subjectId": "ap-english-lang",
      "stem": "A Straw Man fallacy occurs when an author:",
      "options": [
        "Oversimplifies or misrepresents an opponent's argument to make it easier to attack",
        "Assumes that because Event B followed Event A, Event A caused Event B",
        "Argues that an action will trigger an unavoidable catastrophic chain reaction",
        "Repeats the claim as the premise of the argument"
      ],
      "correctIndex": 0,
      "explanation": "A straw man replaces an opponent's actual nuanced stance with a caricatured, easily dismantled distortion.",
      "difficulty": "Hard",
      "timeLimit": 60
    },
    {
      "id": "lang_14",
      "subjectId": "ap-english-lang",
      "stem": "In rhetorical analysis, the 'exigence' of a text refers to:",
      "options": [
        "The real-world issue, problem, or situation that provoked the author to write or speak",
        "The grammatical vocabulary level",
        "The publisher's copyright guidelines",
        "The number of historical citations"
      ],
      "correctIndex": 0,
      "explanation": "Exigence is the catalyst or problem in the rhetorical situation that demands a response from the speaker.",
      "difficulty": "Hard",
      "timeLimit": 60
    },
    {
      "id": "lang_15",
      "subjectId": "ap-english-lang",
      "stem": "What rhetorical scheme reverses the grammatical structure in successive clauses (e.g. \"Never let a Fool Kiss You or a Kiss Fool You\")?",
      "options": [
        "Chiasmus",
        "Polysyndeton",
        "Epistrophe",
        "Hypophora"
      ],
      "correctIndex": 0,
      "explanation": "Chiasmus creates an inverted ABBA syntactic mirror structure that emphasizes wit and thematic reversal.",
      "difficulty": "Hard",
      "timeLimit": 60
    }
  ]
};

// Unbiased Fisher-Yates shuffle guarantees fresh, non-repeating questions each battle
export function getBattleQuestions(subjectId: string, count: number = 5): BattleQuestion[] {
  // Normalize subject alias
  let key = subjectId;
  if (key === 'ap-physics-1') key = 'ap-physics';
  if (!BATTLE_QUESTIONS_BANK[key]) {
    // Try fallback lookup
    key = Object.keys(BATTLE_QUESTIONS_BANK).find(k => k.includes(subjectId) || subjectId.includes(k)) || 'ap-calculus-ab';
  }

  const bank = BATTLE_QUESTIONS_BANK[key] || BATTLE_QUESTIONS_BANK['ap-calculus-ab'] || [];
  const pool = [...bank];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.min(count, pool.length));
}

// Selects an authentic ghost opponent with realistic human response timings
export function getRandomGhostPlayer(subjectId: string): GhostPlayer {
  const randomIndex = Math.floor(Math.random() * GHOST_PROFILES.length);
  return GHOST_PROFILES[randomIndex];
}

```

---

## 5. Backend Server Routes & Matchmaker (`server.ts`)
**File Path**: `server.ts` (Extract of `/api/battle/*` endpoints)
- In-memory strict same-subject matchmaker (`waitingQueue`).
- Real-time room clock management (`activeBattleRooms`).
- Synchronized round reveal timer (2.0s reveal phase).
- Dynamic round timeout (30s-60s per question).
- Self-join prevention & abandoned room cleanup.

```ts
// 1. Enter queue & match ONLY with players ACTIVELY ON RADAR right now
app.post("/api/battle/match", (req, res) => {
  try {
    const { playerId, playerName, playerAvatar, subjectId, questions } = req.body;
    if (!playerId || !subjectId) {
      return res.status(400).json({ error: "Missing playerId or subjectId" });
    }

    const now = Date.now();
    purgeStaleTickets();

    // Clear prior queue/room state for this player
    waitingQueue.delete(playerId);
    playerToRoomMap.delete(playerId);

    const myPlayer: BattlePlayer = {
      id: playerId,
      name: playerName || "Student",
      avatar: playerAvatar || "U",
      score: 0,
      hasAnswered: false,
      currentQ: 0,
      lastSeen: now
    };

    // Check if another real player is ACTIVELY searching on radar right now (< 2000ms)
    let foundOpponent: { qId: string; ticket: { player: BattlePlayer; subjectId: string; questions: any[]; timestamp: number; lastSeen: number } } | null = null;

    // STRICT SAME-SUBJECT MATCHMAKING: Never match across different subjects!
    const myNormSubject = normalizeBattleSubject(subjectId);
    for (const [qId, ticket] of waitingQueue.entries()) {
      if (
        ticket.player.id !== playerId && 
        (now - ticket.lastSeen <= 8000) && 
        normalizeBattleSubject(ticket.subjectId) === myNormSubject
      ) {
        foundOpponent = { qId, ticket };
        break;
      }
    }

    if (foundOpponent) {
      // Both are actively on radar right now! Match them!
      waitingQueue.delete(foundOpponent.qId);
      waitingQueue.delete(playerId);

      const roomId = `room_${now}_${Math.random().toString(36).substring(2, 6)}`;
      const battleQuestions = (foundOpponent.ticket.questions && foundOpponent.ticket.questions.length > 0)
        ? foundOpponent.ticket.questions
        : (questions && questions.length > 0 ? questions : []);

      const newRoom: ServerRoom = {
        id: roomId,
        subjectId: foundOpponent.ticket.subjectId || subjectId,
        status: 'countdown',
        player1: foundOpponent.ticket.player,
        player2: myPlayer,
        questions: battleQuestions,
        currentQ: 0,
        roundStatus: 'playing',
        roundStartTime: now + 3000,
        countdownStart: now,
        updatedAt: now
      };

      activeBattleRooms.set(roomId, newRoom);
      playerToRoomMap.set(foundOpponent.ticket.player.id, roomId);
      playerToRoomMap.set(playerId, roomId);

      console.log(`[Battle Matchmaker] MATCHED REAL PLAYERS! ${foundOpponent.ticket.player.name} vs ${myPlayer.name} in room ${roomId}`);

      return res.json({
        status: "matched",
        roomId,
        isPlayer1: false,
        opponent: foundOpponent.ticket.player,
        questions: newRoom.questions,
        subjectId: newRoom.subjectId
      });
    }

    // No active opponent right now: put in queue with fresh lastSeen
    waitingQueue.set(playerId, {
      player: myPlayer,
      subjectId,
      questions: questions || [],
      timestamp: now,
      lastSeen: now
    });

    console.log(`[Battle Matchmaker] ${myPlayer.name} entered radar. Active queue: ${waitingQueue.size}`);
    return res.json({ status: "waiting" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Poll match status while active on radar screen (called every 350ms)
app.post("/api/battle/poll-match", (req, res) => {
  try {
    const { playerId } = req.body;
    if (!playerId) {
      return res.status(400).json({ error: "Missing playerId" });
    }

    const now = Date.now();
    purgeStaleTickets();

    // Check if matched into room
    const roomId = playerToRoomMap.get(playerId);
    if (roomId) {
      const room = activeBattleRooms.get(roomId);
      if (room && (room.status === 'countdown' || room.status === 'battle')) {
        waitingQueue.delete(playerId);
        const opponent = room.player1.id === playerId ? room.player2 : room.player1;
        const isP1 = room.player1.id === playerId;
        return res.json({
          status: "matched",
          roomId: room.id,
          isPlayer1: isP1,
          opponent,
          questions: room.questions,
          subjectId: room.subjectId
        });
      }
    }

    // Update active heartbeat for this player in queue
    const myTicket = waitingQueue.get(playerId);
    if (myTicket) {
      myTicket.lastSeen = now;

      // Proactive pairing: ONLY match if both players chose the EXACT SAME SUBJECT!
      const myNormSubject = normalizeBattleSubject(myTicket.subjectId);
      for (const [qId, otherTicket] of waitingQueue.entries()) {
        if (
          qId !== playerId && 
          otherTicket.player.id !== playerId && 
          (now - otherTicket.lastSeen <= 8000) &&
          normalizeBattleSubject(otherTicket.subjectId) === myNormSubject
        ) {
          waitingQueue.delete(playerId);
          waitingQueue.delete(qId);

          const newRoomId = `room_${now}_${Math.random().toString(36).substring(2, 6)}`;
          const battleQuestions = (otherTicket.questions && otherTicket.questions.length > 0)
            ? otherTicket.questions
            : (myTicket.questions && myTicket.questions.length > 0 ? myTicket.questions : []);

          const newRoom: ServerRoom = {
            id: newRoomId,
            subjectId: otherTicket.subjectId || myTicket.subjectId,
            status: 'countdown',
            player1: otherTicket.player,
            player2: myTicket.player,
            questions: battleQuestions,
            currentQ: 0,
            roundStatus: 'playing',
            roundStartTime: now + 3000,
            countdownStart: now,
            updatedAt: now
          };

          activeBattleRooms.set(newRoomId, newRoom);
          playerToRoomMap.set(otherTicket.player.id, newRoomId);
          playerToRoomMap.set(playerId, newRoomId);

          console.log(`[Battle Matchmaker] PROACTIVE MATCH: ${otherTicket.player.name} vs ${myTicket.player.name} in room ${newRoomId}`);

          return res.json({
            status: "matched",
            roomId: newRoomId,
            isPlayer1: false,
            opponent: otherTicket.player,
            questions: newRoom.questions,
            subjectId: newRoom.subjectId
          });
        }
      }
    }

    return res.json({ status: "waiting" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Cleanly cancel/leave queue or room
app.post("/api/battle/cancel", (req, res) => {
  try {
    const { playerId, roomId } = req.body;
    if (playerId) {
      waitingQueue.delete(playerId);
      const targetRoomId = roomId || playerToRoomMap.get(playerId);
      if (targetRoomId) {
        const room = activeBattleRooms.get(targetRoomId);
        if (room) {
          if (room.status === 'waiting' && room.player1.id === playerId) {
            // Host cancelled before anyone joined -> immediately destroy abandoned room
            activeBattleRooms.delete(targetRoomId);
            console.log(`[Battle Matchmaker] Waiting room ${targetRoomId} deleted because host cancelled.`);
          } else if (room.status === 'countdown' || room.status === 'battle') {
            // Player forfeited active battle -> mark finished so remaining opponent wins cleanly
            const leaver = room.player1.id === playerId ? room.player1 : (room.player2?.id === playerId ? room.player2 : null);
            if (leaver) leaver.finished = true;
            room.status = 'finished';
            room.updatedAt = Date.now();
            console.log(`[Battle Matchmaker] Player ${playerId} forfeited match in room ${targetRoomId}.`);
          }
        }
        playerToRoomMap.delete(playerId);
      }
      console.log(`[Battle Matchmaker] Player ${playerId} cleanly left queue/room.`);
    }
    res.json({ success: true });
  } catch {
    res.json({ success: true });
  }
});

// 4. Create Friend Room
app.post("/api/battle/room/create", (req, res) => {
  try {
    const { roomCode, player, subjectId, questions } = req.body;
    const now = Date.now();
    const code = (roomCode || `AP-${Math.floor(1000 + Math.random() * 9000)}`).toUpperCase();
    const roomId = `room_${code}`;

    const newRoom: ServerRoom = {
      id: roomId,
      code,
      subjectId,
      status: 'waiting',
      player1: {
        id: player.id,
        name: player.name,
        avatar: player.avatar,
        score: 0,
        hasAnswered: false,
        currentQ: 0,
        lastSeen: now
      },
      player2: null,
      questions: questions || [],
      currentQ: 0,
      roundStatus: 'playing',
      roundStartTime: now + 3000,
      updatedAt: now
    };

    activeBattleRooms.set(roomId, newRoom);
    playerToRoomMap.set(player.id, roomId);

    res.json({ success: true, roomId, code });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Join Friend Room
app.post("/api/battle/room/join", (req, res) => {
  try {
    const { roomCode, player } = req.body;
    const code = (roomCode || "").toUpperCase().trim();
    const roomId = `room_${code}`;

    const room = activeBattleRooms.get(roomId);
    if (!room) {
      return res.status(404).json({ error: "Room not found. Check the code!" });
    }
    if (room.player1.id === player.id) {
      return res.status(400).json({ error: "You are the host of this room!" });
    }
    if (room.status !== 'waiting') {
      return res.status(400).json({ error: "Room already in progress or full!" });
    }

    const now = Date.now();
    room.player2 = {
      id: player.id,
      name: player.name,
      avatar: player.avatar,
      score: 0,
      hasAnswered: false,
      currentQ: 0,
      lastSeen: now
    };
    room.status = 'countdown';
    room.countdownStart = now;
    room.roundStartTime = now + 3000;
    room.updatedAt = now;

    playerToRoomMap.set(player.id, roomId);

    res.json({
      success: true,
      roomId,
      room,
      opponent: room.player1,
      questions: room.questions,
      subjectId: room.subjectId
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Real-time Player Action & Synchronized Round Progression
app.post("/api/battle/action", (req, res) => {
  try {
    const { roomId, playerId, score, hasAnswered, finished } = req.body;
    const room = activeBattleRooms.get(roomId);
    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

    const now = Date.now();
    const target = room.player1.id === playerId ? room.player1 : (room.player2?.id === playerId ? room.player2 : null);
    if (target) {
      if (typeof score === 'number') target.score = score;
      if (typeof hasAnswered === 'boolean') target.hasAnswered = hasAnswered;
      if (typeof finished === 'boolean') target.finished = finished;
      target.lastSeen = now;
      room.updatedAt = now;
    }

    // CHECK: Have both players answered this question?
    if ((room.status === 'battle' || room.status === 'countdown') && room.roundStatus === 'playing') {
      const p1Answered = room.player1.hasAnswered;
      const p2Answered = room.player2?.hasAnswered;

      if (p1Answered && p2Answered) {
        // Both answered! Trigger synchronized reveal for 2.0s
        room.roundStatus = 'revealed';
        room.revealStartTime = now;
        room.updatedAt = now;
      }
    }

    if (room.player1.finished && room.player2?.finished) {
      room.status = 'finished';
      room.updatedAt = now;
    }

    res.json({ success: true, room });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Get Room Status & Server Round Clock Advancement (polled every 350ms)
app.get("/api/battle/room/:roomId", (req, res) => {
  try {
    const { roomId } = req.params;
    const room = activeBattleRooms.get(roomId);
    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

    const now = Date.now();

    // 1. Transition from countdown to battle when 3000ms has elapsed
    if (room.status === 'countdown' && room.countdownStart) {
      if (now - room.countdownStart >= 3000) {
        room.status = 'battle';
        room.roundStatus = 'playing';
        room.roundStartTime = now;
        room.updatedAt = now;
      }
    }

    // 2. Auto-advance round if reveal timeout (2000ms) has elapsed
    if (room.status === 'battle' && room.roundStatus === 'revealed' && room.revealStartTime) {
      if (now - room.revealStartTime >= 2000) {
        const nextQ = room.currentQ + 1;
        if (nextQ < (room.questions?.length || 5)) {
          room.currentQ = nextQ;
          room.roundStatus = 'playing';
          room.roundStartTime = now;
          room.player1.hasAnswered = false;
          if (room.player2) room.player2.hasAnswered = false;
          room.revealStartTime = undefined;
          room.updatedAt = now;
        } else {
          room.status = 'finished';
          room.updatedAt = now;
        }
      }
    }

    // 3. Auto-timeout round if dynamic question duration (30s-60s) elapsed without both answering
    if (room.status === 'battle' && room.roundStatus === 'playing') {
      const currQ = room.questions?.[room.currentQ];
      const qDurationMs = ((currQ?.timeLimit || 30) * 1000) + 500;
      if (now - room.roundStartTime >= qDurationMs) {
        room.roundStatus = 'revealed';
        room.revealStartTime = now;
        room.player1.hasAnswered = true;
        if (room.player2) room.player2.hasAnswered = true;
        room.updatedAt = now;
      }
    }

    res.json({ room });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
```
