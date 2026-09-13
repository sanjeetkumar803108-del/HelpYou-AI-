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
