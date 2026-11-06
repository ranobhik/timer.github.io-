import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  BellOff,
  Repeat,
  Sun,
  Moon,
  Bell,
  Trash2,
  Plus,
  Minus,
  Check,
} from 'lucide-react';
import { ChronographDial, TimerStatus, TimeSegment } from './components/ChronographDial';
import { soundEngine, ALARM_TONES, AlarmTone } from './utils/soundEngine';

interface PresetItem {
  label: string;
  seconds: number;
  tag?: string;
}

const PRESETS: PresetItem[] = [
  { label: '1 мин', seconds: 60 },
  { label: '3 мин', seconds: 180 },
  { label: '5 мин', seconds: 300 },
  { label: '10 мин', seconds: 600 },
  { label: '15 мин', seconds: 900 },
  { label: '25 мин', seconds: 1500, tag: 'Фокус' },
  { label: '45 мин', seconds: 2700 },
  { label: '1 час', seconds: 3600 },
];

const MAX_DURATION_MS = (99 * 3600 + 59 * 60 + 59) * 1000; // 99:59:59

function formatDocumentTime(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (h > 0) {
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }
  return `${pad(m)}:${pad(s)}`;
}

export function App() {
  // Initial default: 5 minutes (300,000 ms)
  const [totalDurationMs, setTotalDurationMs] = useState<number>(() => {
    const saved = localStorage.getItem('et66_timer_duration_ms');
    return saved ? Math.max(0, parseInt(saved, 10)) : 5 * 60 * 1000;
  });
  const [remainingMs, setRemainingMs] = useState<number>(() => {
    const saved = localStorage.getItem('et66_timer_duration_ms');
    return saved ? Math.max(0, parseInt(saved, 10)) : 5 * 60 * 1000;
  });

  const [status, setStatus] = useState<TimerStatus>('IDLE');
  const [selectedSegment, setSelectedSegment] = useState<TimeSegment>(null);
  const [label, setLabel] = useState<string>('Фокус');
  const [autoRepeat, setAutoRepeat] = useState<boolean>(false);
  const [completedCycles, setCompletedCycles] = useState<number>(0);

  // Подходы (workout sets) tracking, как на 3-м скриншоте
  const [setsDone, setSetsDone] = useState<number>(() => {
    const saved = parseInt(localStorage.getItem('et66_sets_done') ?? '0', 10);
    return Number.isFinite(saved) ? Math.max(0, Math.min(99, saved)) : 0;
  });
  const [setsTarget, setSetsTarget] = useState<number>(() => {
    const saved = parseInt(localStorage.getItem('et66_sets_target') ?? '5', 10);
    return Number.isFinite(saved) ? Math.max(1, Math.min(12, saved)) : 5;
  });
  const [autoRecordSet, setAutoRecordSet] = useState<boolean>(() => {
    return localStorage.getItem('et66_sets_auto') !== 'false';
  });

  // Preferences
  const [muted, setMuted] = useState<boolean>(() => {
    return localStorage.getItem('et66_timer_muted') === 'true';
  });
  const [alarmTone, setAlarmTone] = useState<AlarmTone>(() => {
    const saved = localStorage.getItem('et66_timer_tone') as AlarmTone;
    return saved && ['braun', 'chime', 'pulse'].includes(saved) ? saved : 'braun';
  });
  const [isDark, setIsDark] = useState<boolean>(() => {
    const saved = localStorage.getItem('et66_timer_theme');
    return saved ? saved === 'dark' : true;
  });
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [showToneMenu, setShowToneMenu] = useState<boolean>(false);

  // Drift-free timing refs
  const endTimeRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastWholeSecondRef = useRef<number | null>(null);

  // Save preferences
  useEffect(() => {
    localStorage.setItem('et66_timer_muted', String(muted));
    if (muted) {
      soundEngine.stopAlarmLoop();
    }
  }, [muted]);

  useEffect(() => {
    localStorage.setItem('et66_timer_tone', alarmTone);
  }, [alarmTone]);

  useEffect(() => {
    localStorage.setItem('et66_timer_theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  // Persist workout sets state
  useEffect(() => {
    localStorage.setItem('et66_sets_done', String(setsDone));
  }, [setsDone]);

  useEffect(() => {
    localStorage.setItem('et66_sets_target', String(setsTarget));
  }, [setsTarget]);

  useEffect(() => {
    localStorage.setItem('et66_sets_auto', String(autoRecordSet));
  }, [autoRecordSet]);

  // One-time success chime when the last planned set is completed
  const prevSetsDoneRef = useRef(setsDone);
  useEffect(() => {
    if (
      setsTarget > 0 &&
      setsDone >= setsTarget &&
      prevSetsDoneRef.current < setsTarget &&
      !muted
    ) {
      soundEngine.playAlarmPattern('chime');
    }
    prevSetsDoneRef.current = setsDone;
  }, [setsDone, setsTarget, muted]);

  // Save configured duration when idle
  useEffect(() => {
    if (status === 'IDLE' && totalDurationMs > 0) {
      localStorage.setItem('et66_timer_duration_ms', String(totalDurationMs));
    }
  }, [totalDurationMs, status]);

  // Update browser tab title dynamically (оставшееся время + прогресс подходов)
  useEffect(() => {
    const setsSuffix = setsDone > 0 ? ` · Подход ${setsDone}/${setsTarget}` : '';
    if (status === 'RUNNING') {
      const timeStr = formatDocumentTime(remainingMs);
      document.title = `▶ ${timeStr}${setsSuffix} — ${label || 'Таймер'}`;
    } else if (status === 'PAUSED') {
      const timeStr = formatDocumentTime(remainingMs);
      document.title = `⏸ ${timeStr}${setsSuffix} (Пауза) — Таймер`;
    } else if (status === 'COMPLETED') {
      document.title =
        setsTarget > 0 && setsDone >= setsTarget
          ? `✅ Все подходы выполнены (${setsDone}/${setsTarget}) — ${label || 'Таймер'}`
          : `🔔 ВРЕМЯ ВЫШЛО!${setsSuffix} — ${label || 'Таймер'}`;
    } else {
      document.title =
        setsDone > 0
          ? `ТАЙМЕР ET-66 · Подход ${setsDone}/${setsTarget} — Точный отсчёт времени`
          : 'ТАЙМЕР — Точный отсчёт времени';
    }
  }, [status, Math.ceil(remainingMs / 1000), label, setsDone, setsTarget]);

  // Fullscreen change listener
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // Main high-precision countdown loop
  useEffect(() => {
    if (status !== 'RUNNING') {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    const tick = () => {
      if (!endTimeRef.current) return;
      const now = Date.now();
      const left = Math.max(0, endTimeRef.current - now);

      // Final 5 seconds audible tick check
      const currentWholeSec = Math.ceil(left / 1000);
      if (
        currentWholeSec <= 5 &&
        currentWholeSec > 0 &&
        lastWholeSecondRef.current !== currentWholeSec
      ) {
        lastWholeSecondRef.current = currentWholeSec;
        soundEngine.playCountdownTick(currentWholeSec, muted);
      }

      if (left <= 0) {
        setCompletedCycles((c) => c + 1);
        // Авто-зачёт: каждый завершённый круг таймера отмечает один подход
        if (autoRecordSet) {
          setSetsDone((d) => Math.min(99, d + 1));
        }

        if (autoRepeat && totalDurationMs > 0) {
          // Play one alarm chime and immediately loop
          if (!muted) {
            soundEngine.playAlarmPattern(alarmTone);
          }
          endTimeRef.current = Date.now() + totalDurationMs;
          lastWholeSecondRef.current = null;
          setRemainingMs(totalDurationMs);
          rafRef.current = requestAnimationFrame(tick);
        } else {
          setRemainingMs(0);
          setStatus('COMPLETED');
          endTimeRef.current = null;
          soundEngine.startAlarmLoop(alarmTone, muted);
        }
        return;
      }

      setRemainingMs(left);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    // Also add visibilitychange / interval fallback when tab is in background
    const bgInterval = window.setInterval(() => {
      if (document.hidden && endTimeRef.current) {
        tick();
      }
    }, 250);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
      clearInterval(bgInterval);
    };
  }, [status, autoRepeat, totalDurationMs, alarmTone, muted, autoRecordSet]);

  // Actions
  const handleStartPause = useCallback(() => {
    soundEngine.stopAlarmLoop();

    if (status === 'COMPLETED') {
      // Dismiss alarm and reset to configured duration
      soundEngine.playClick('reset', muted);
      setRemainingMs(totalDurationMs);
      setStatus('IDLE');
      return;
    }

    if (status === 'RUNNING') {
      // Pause
      soundEngine.playClick('pause', muted);
      if (endTimeRef.current) {
        const left = Math.max(0, endTimeRef.current - Date.now());
        setRemainingMs(left);
      }
      endTimeRef.current = null;
      setStatus('PAUSED');
      return;
    }

    // Starting from IDLE or PAUSED
    const targetMs = remainingMs > 0 ? remainingMs : totalDurationMs;
    if (targetMs <= 0) return;

    soundEngine.playClick('start', muted);
    setSelectedSegment(null);
    if (remainingMs <= 0) {
      setRemainingMs(totalDurationMs);
    }
    endTimeRef.current = Date.now() + targetMs;
    lastWholeSecondRef.current = Math.ceil(targetMs / 1000);
    setStatus('RUNNING');
  }, [status, remainingMs, totalDurationMs, muted]);

  const handleReset = useCallback(() => {
    soundEngine.stopAlarmLoop();
    soundEngine.playClick('reset', muted);
    endTimeRef.current = null;
    lastWholeSecondRef.current = null;

    if (status === 'IDLE' && remainingMs === totalDurationMs) {
      // If already idle at full duration, clear to 00:00:00
      setTotalDurationMs(0);
      setRemainingMs(0);
    } else {
      // Reset back to configured totalDurationMs
      setRemainingMs(totalDurationMs);
      setStatus('IDLE');
    }
  }, [status, remainingMs, totalDurationMs, muted]);

  const handleClearToZero = useCallback(() => {
    soundEngine.stopAlarmLoop();
    soundEngine.playClick('reset', muted);
    endTimeRef.current = null;
    lastWholeSecondRef.current = null;
    setStatus('IDLE');
    setTotalDurationMs(0);
    setRemainingMs(0);
  }, [muted]);

  const handleSelectPreset = useCallback(
    (seconds: number, presetTag?: string) => {
      soundEngine.stopAlarmLoop();
      soundEngine.playClick('step', muted);
      const ms = seconds * 1000;
      endTimeRef.current = null;
      lastWholeSecondRef.current = null;
      setStatus('IDLE');
      setTotalDurationMs(ms);
      setRemainingMs(ms);
      setSelectedSegment(null);
      if (presetTag) {
        setLabel(presetTag);
      }
    },
    [muted]
  );

  // Подходы: отметить / снять / переключить конкретный / сброс / цель
  const handleAddSet = useCallback(() => {
    soundEngine.playClick('start', muted);
    setSetsDone((d) => Math.min(99, d + 1));
  }, [muted]);

  const handleRemoveSet = useCallback(() => {
    soundEngine.playClick('reset', muted);
    setSetsDone((d) => Math.max(0, d - 1));
  }, [muted]);

  const handleToggleSet = useCallback(
    (index: number) => {
      soundEngine.playClick('step', muted);
      setSetsDone((d) => (d === index ? index - 1 : index));
    },
    [muted]
  );

  const handleResetSets = useCallback(() => {
    soundEngine.playClick('reset', muted);
    setSetsDone(0);
  }, [muted]);

  const handleAdjustTarget = useCallback(
    (delta: number) => {
      soundEngine.playClick('soft', muted);
      setSetsTarget((t) => Math.max(1, Math.min(12, t + delta)));
    },
    [muted]
  );

  // Add or subtract seconds dynamically (works in IDLE, PAUSED, and RUNNING!)
  const handleAddSeconds = useCallback(
    (deltaSeconds: number) => {
      soundEngine.stopAlarmLoop();
      soundEngine.playClick('step', muted);
      const deltaMs = deltaSeconds * 1000;

      if (status === 'RUNNING' && endTimeRef.current) {
        const currentLeft = Math.max(0, endTimeRef.current - Date.now());
        const nextLeft = Math.max(1000, Math.min(MAX_DURATION_MS, currentLeft + deltaMs));
        endTimeRef.current = Date.now() + nextLeft;
        setRemainingMs(nextLeft);
        setTotalDurationMs((prev) => Math.max(nextLeft, prev + deltaMs));
      } else {
        const baseMs = status === 'COMPLETED' ? 0 : remainingMs;
        const nextMs = Math.max(0, Math.min(MAX_DURATION_MS, baseMs + deltaMs));
        setRemainingMs(nextMs);
        setTotalDurationMs(nextMs);
        if (status === 'COMPLETED') {
          setStatus('IDLE');
        }
      }
    },
    [status, remainingMs, muted]
  );

  // Adjust individual segment (hours, minutes, seconds) via + / - steppers or mouse wheel
  const handleAdjustSegment = useCallback(
    (segment: 'hours' | 'minutes' | 'seconds', delta: number) => {
      soundEngine.stopAlarmLoop();
      soundEngine.playClick('step', muted);

      const currentSec = Math.round(remainingMs / 1000);
      let h = Math.floor(currentSec / 3600);
      let m = Math.floor((currentSec % 3600) / 60);
      let s = currentSec % 60;

      if (segment === 'hours') {
        h = (h + delta + 100) % 100;
      } else if (segment === 'minutes') {
        m = (m + delta + 60) % 60;
      } else if (segment === 'seconds') {
        s = (s + delta + 60) % 60;
      }

      const nextMs = (h * 3600 + m * 60 + s) * 1000;
      setRemainingMs(nextMs);
      setTotalDurationMs(nextMs);
      if (status === 'COMPLETED') {
        setStatus('IDLE');
      }
    },
    [remainingMs, status, muted]
  );

  // Set exact segment value via direct keyboard digit input
  const handleSetSegmentValue = useCallback(
    (segment: 'hours' | 'minutes' | 'seconds', value: number) => {
      soundEngine.stopAlarmLoop();
      soundEngine.playClick('soft', muted);

      const currentSec = Math.round(remainingMs / 1000);
      let h = Math.floor(currentSec / 3600);
      let m = Math.floor((currentSec % 3600) / 60);
      let s = currentSec % 60;

      if (segment === 'hours') h = Math.max(0, Math.min(99, value));
      if (segment === 'minutes') m = Math.max(0, Math.min(59, value));
      if (segment === 'seconds') s = Math.max(0, Math.min(59, value));

      const nextMs = (h * 3600 + m * 60 + s) * 1000;
      setRemainingMs(nextMs);
      setTotalDurationMs(nextMs);
    },
    [remainingMs, muted]
  );

  const toggleFullscreen = useCallback(() => {
    soundEngine.playClick('soft', muted);
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }, [muted]);

  // Global keyboard shortcuts (Space, R/К, M/Ь, F/А)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        handleStartPause();
      } else if (e.code === 'KeyR' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        handleReset();
      } else if (e.code === 'KeyM' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setMuted((prev) => !prev);
      } else if (e.code === 'KeyF' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.code === 'Escape' && status === 'COMPLETED') {
        e.preventDefault();
        handleStartPause();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [handleStartPause, handleReset, toggleFullscreen, status, handleAddSet]);

  const canStart = remainingMs > 0 || totalDurationMs > 0;
  const allSetsDone = setsTarget > 0 && setsDone >= setsTarget;

  return (
    <div
      className={`min-h-screen w-full flex flex-col justify-between transition-colors duration-300 px-3 sm:px-6 py-4 sm:py-6 ${
        isDark ? 'bg-[#0C0D10] text-[#F3F4F6]' : 'bg-[#F4F4F0] text-[#111315]'
      }`}
    >
      {/* Top Instrument Utility Bar */}
      <header className="w-full max-w-[540px] mx-auto flex items-center justify-between">
        {/* Brand / Hardware Model Identifier */}
        <div className="flex items-center gap-2.5">
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center border ${
              isDark
                ? 'bg-[#15171C] border-white/10'
                : 'bg-white border-black/10 shadow-xs'
            }`}
          >
            <span
              className={`w-2.5 h-2.5 rounded-full transition-colors ${
                status === 'RUNNING'
                  ? 'bg-[#FF5722] shadow-[0_0_8px_#FF5722]'
                  : status === 'COMPLETED'
                    ? 'bg-[#EF4444] animate-ping'
                    : 'bg-[#FF5722]/75'
              }`}
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xs sm:text-sm font-bold tracking-[0.08em] uppercase">
                ТАЙМЕР ET-66
              </h1>
              {completedCycles > 0 && (
                <span className="px-1.5 py-0.2 rounded text-[10px] font-mono-tabular font-semibold bg-[#FF5722]/15 text-[#FF5722]">
                  ×{completedCycles}
                </span>
              )}
            </div>
            <p
              className={`text-[11px] leading-tight ${
                isDark ? 'text-[#6B7280]' : 'text-neutral-500'
              }`}
            >
              Точный отсчёт времени
            </p>
          </div>
        </div>

        {/* Right Controls: Sound Melody, Mute, Theme, Fullscreen */}
        <div className="flex items-center gap-1.5 relative">
          {/* Melody Selector Dropdown Button */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowToneMenu((v) => !v)}
              className={`h-9 px-2.5 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 border transition-all ${
                isDark
                  ? 'bg-[#15171C] border-white/10 text-[#9CA3AF] hover:text-white hover:bg-[#1E2128]'
                  : 'bg-white border-black/10 text-neutral-700 hover:text-black hover:bg-neutral-100'
              }`}
              title="Выбрать мелодию сигнала"
            >
              <Bell className="w-3.5 h-3.5 text-[#FF5722]" />
              <span className="hidden sm:inline">
                {ALARM_TONES.find((t) => t.id === alarmTone)?.label}
              </span>
            </button>

            {showToneMenu && (
              <>
                <div
                  className="fixed inset-0 z-20"
                  onClick={() => setShowToneMenu(false)}
                />
                <div
                  className={`absolute right-0 mt-2 w-60 rounded-xl p-1.5 z-30 border shadow-xl ${
                    isDark
                      ? 'bg-[#15171C] border-white/10 text-[#F3F4F6]'
                      : 'bg-white border-black/10 text-neutral-900'
                  }`}
                >
                  <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#6B7280]">
                    Звуковой сигнал по окончании
                  </div>
                  {ALARM_TONES.map((tone) => {
                    const active = alarmTone === tone.id;
                    return (
                      <button
                        key={tone.id}
                        type="button"
                        onClick={() => {
                          setAlarmTone(tone.id);
                          setMuted(false);
                          soundEngine.playAlarmPattern(tone.id);
                          setShowToneMenu(false);
                        }}
                        className={`w-full text-left px-2.5 py-2 rounded-lg transition-colors flex items-center justify-between ${
                          active
                            ? 'bg-[#FF5722]/15 text-[#FF5722]'
                            : isDark
                              ? 'hover:bg-white/5'
                              : 'hover:bg-black/5'
                        }`}
                      >
                        <div>
                          <div className="text-xs font-semibold">{tone.label}</div>
                          <div className="text-[11px] text-[#6B7280] leading-tight">
                            {tone.description}
                          </div>
                        </div>
                        {active && (
                          <span className="w-2 h-2 rounded-full bg-[#FF5722] shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* Mute / Unmute Toggle */}
          <button
            type="button"
            onClick={() => {
              const nextMuted = !muted;
              setMuted(nextMuted);
              if (!nextMuted) {
                soundEngine.playClick('soft', false);
              }
            }}
            className={`w-9 h-9 rounded-lg flex items-center justify-center border transition-all ${
              muted
                ? 'bg-[#EF4444]/15 border-[#EF4444]/30 text-[#EF4444]'
                : isDark
                  ? 'bg-[#15171C] border-white/10 text-[#9CA3AF] hover:text-white hover:bg-[#1E2128]'
                  : 'bg-white border-black/10 text-neutral-700 hover:text-black hover:bg-neutral-100'
            }`}
            aria-label={muted ? 'Включить звук' : 'Выключить звук'}
            title={muted ? 'Звук выключен (M)' : 'Звук включён (M)'}
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          {/* Theme Switcher (Carbon Dark / Braun Aluminum Light) */}
          <button
            type="button"
            onClick={() => {
              soundEngine.playClick('soft', muted);
              setIsDark((d) => !d);
            }}
            className={`w-9 h-9 rounded-lg flex items-center justify-center border transition-all ${
              isDark
                ? 'bg-[#15171C] border-white/10 text-[#9CA3AF] hover:text-white hover:bg-[#1E2128]'
                : 'bg-white border-black/10 text-neutral-700 hover:text-black hover:bg-neutral-100'
            }`}
            aria-label="Переключить тему"
            title={isDark ? 'Светлый корпус Braun' : 'Тёмный карбоновый корпус'}
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* Fullscreen Toggle */}
          <button
            type="button"
            onClick={toggleFullscreen}
            className={`w-9 h-9 rounded-lg flex items-center justify-center border transition-all ${
              isDark
                ? 'bg-[#15171C] border-white/10 text-[#9CA3AF] hover:text-white hover:bg-[#1E2128]'
                : 'bg-white border-black/10 text-neutral-700 hover:text-black hover:bg-neutral-100'
            }`}
            aria-label="Полный экран"
            title="Полный экран (F)"
          >
            {isFullscreen ? (
              <Minimize2 className="w-4 h-4" />
            ) : (
              <Maximize2 className="w-4 h-4" />
            )}
          </button>
        </div>
      </header>

      {/* Main Centered Instrument Bezel */}
      <main className="w-full max-w-[540px] mx-auto my-auto py-3">
        <div
          className={`rounded-[28px] p-4 sm:p-6 transition-all duration-300 ${
            status === 'COMPLETED'
              ? isDark
                ? 'bg-[#15171C] alarm-active-bezel'
                : 'bg-white alarm-active-bezel'
              : isDark
                ? 'bg-[#15171C] instrument-bezel-dark'
                : 'bg-[#FFFFFF] instrument-bezel-light'
          }`}
        >
          {/* Radial Chronograph Dial & Readout */}
          <ChronographDial
            status={status}
            remainingMs={remainingMs}
            totalDurationMs={totalDurationMs}
            isDark={isDark}
            label={label}
            onLabelChange={setLabel}
            onAdjustSegment={handleAdjustSegment}
            onSetSegmentValue={handleSetSegmentValue}
            selectedSegment={selectedSegment}
            onSelectSegment={setSelectedSegment}
          />

          {/* Подходы (Sets) Panel — отметка тренировочных подходов */}
          <div
            className={`mt-4 rounded-2xl border p-3 transition-colors duration-300 ${
              allSetsDone
                ? isDark
                  ? 'bg-emerald-500/[0.06] border-emerald-500/30'
                  : 'bg-emerald-50 border-emerald-500/40'
                : isDark
                  ? 'bg-[#101218] border-white/[0.08]'
                  : 'bg-[#FAFAF7] border-black/[0.08]'
            }`}
          >
            {/* Panel header: label + counter + auto-record + goal stepper */}
            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
              <div className="flex items-center gap-2">
                <span
                  className={`text-[11px] font-semibold uppercase tracking-[0.08em] ${
                    isDark ? 'text-[#6B7280]' : 'text-neutral-500'
                  }`}
                >
                  Подходы
                </span>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono-tabular font-semibold border ${
                    allSetsDone
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-500'
                      : isDark
                        ? 'bg-[#15171C] border-white/10 text-[#F3F4F6]'
                        : 'bg-white border-black/10 text-neutral-800'
                  }`}
                >
                  {allSetsDone && <Check className="w-3 h-3" strokeWidth={3} />}
                  {setsDone} / {setsTarget}
                </span>
                <button
                  type="button"
                  onClick={handleResetSets}
                  disabled={setsDone === 0}
                  title="Сбросить подходы"
                  aria-label="Сбросить подходы"
                  className={`w-6 h-6 rounded-md inline-flex items-center justify-center border transition-all active:scale-95 disabled:opacity-30 disabled:pointer-events-none ${
                    isDark
                      ? 'border-white/10 text-[#9CA3AF] hover:text-white hover:bg-white/5'
                      : 'border-black/10 text-neutral-500 hover:text-black hover:bg-black/5'
                  }`}
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
                {allSetsDone && (
                  <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-500">
                    Готово!
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                {/* Auto-record toggle: отмечать подход при завершении таймера */}
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.playClick('soft', muted);
                    setAutoRecordSet((v) => !v);
                  }}
                  aria-pressed={autoRecordSet}
                  title="Автоматически отмечать подход по завершении таймера"
                  className={`h-7 pl-2 pr-2.5 rounded-lg inline-flex items-center gap-1.5 text-[10px] sm:text-[11px] font-semibold border transition-all active:scale-95 ${
                    autoRecordSet
                      ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-500'
                      : isDark
                        ? 'bg-[#15171C] border-white/10 text-[#6B7280] hover:text-[#9CA3AF]'
                        : 'bg-white border-black/10 text-neutral-400 hover:text-neutral-600'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      autoRecordSet ? 'bg-emerald-400 animate-pulse' : isDark ? 'bg-[#4B5563]' : 'bg-neutral-300'
                    }`}
                  />
                  Авто-зачёт
                </button>

                {/* Goal stepper */}
                <div
                  className={`h-7 rounded-lg inline-flex items-center border overflow-hidden ${
                    isDark ? 'bg-[#15171C] border-white/10' : 'bg-white border-black/10'
                  }`}
                  title="Цель: сколько подходов нужно выполнить"
                >
                  <button
                    type="button"
                    onClick={() => handleAdjustTarget(-1)}
                    disabled={setsTarget <= 1}
                    aria-label="Уменьшить цель"
                    className={`w-6 h-full inline-flex items-center justify-center transition-colors disabled:opacity-30 disabled:pointer-events-none ${
                      isDark ? 'text-[#9CA3AF] hover:text-white hover:bg-white/5' : 'text-neutral-500 hover:text-black hover:bg-black/5'
                    }`}
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <span
                    className={`px-1 text-[10px] sm:text-[11px] font-mono-tabular font-semibold whitespace-nowrap ${
                      isDark ? 'text-[#F3F4F6]' : 'text-neutral-800'
                    }`}
                  >
                    Цель: {setsTarget}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleAdjustTarget(1)}
                    disabled={setsTarget >= 12}
                    aria-label="Увеличить цель"
                    className={`w-6 h-full inline-flex items-center justify-center transition-colors disabled:opacity-30 disabled:pointer-events-none ${
                      isDark ? 'text-[#9CA3AF] hover:text-white hover:bg-white/5' : 'text-neutral-500 hover:text-black hover:bg-black/5'
                    }`}
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>

            {/* Numbered set toggles + quick actions */}
            <div className="mt-2 flex flex-wrap items-stretch gap-1.5">
              {Array.from({ length: setsTarget }, (_, i) => i + 1).map((n) => {
                const done = n <= setsDone;
                const isNext = n === setsDone + 1;
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => handleToggleSet(n)}
                    aria-pressed={done}
                    title={done ? `Подход ${n} — выполнен (нажмите, чтобы снять)` : `Отметить подход ${n}`}
                    className={`flex-1 min-w-[2rem] h-9 rounded-lg text-xs font-mono-tabular font-bold border transition-all active:scale-95 ${
                      done
                        ? 'bg-gradient-to-b from-[#FF6E3A] to-[#FF5722] border-[#FF5722]/70 text-white shadow-[0_2px_12px_-2px_rgba(255,87,34,0.55)]'
                        : isNext
                          ? isDark
                            ? 'bg-[#15171C] border-[#FF5722]/60 text-[#FF8A5C] hover:bg-[#FF5722]/10'
                            : 'bg-white border-[#FF5722]/60 text-[#FF5722] hover:bg-[#FF5722]/5'
                          : isDark
                            ? 'bg-[#15171C] border-white/10 text-[#9CA3AF] hover:text-white hover:border-white/25'
                            : 'bg-white border-black/10 text-neutral-500 hover:text-black hover:border-black/25'
                    }`}
                  >
                    {n}
                  </button>
                );
              })}
              {/* Remove last set */}
              <button
                type="button"
                onClick={handleRemoveSet}
                disabled={setsDone === 0}
                title="Снять последний подход"
                aria-label="Снять последний подход"
                className={`w-9 h-9 rounded-lg border inline-flex items-center justify-center transition-all active:scale-95 disabled:opacity-30 disabled:pointer-events-none ${
                  isDark
                    ? 'bg-[#15171C] border-white/10 text-[#9CA3AF] hover:text-white hover:bg-white/5'
                    : 'bg-white border-black/10 text-neutral-500 hover:text-black hover:bg-black/5'
                }`}
              >
                <Minus className="w-4 h-4" />
              </button>
              {/* Mark next set done */}
              <button
                type="button"
                onClick={handleAddSet}
                title="Отметить следующий подход (клавиша S)"
                className="h-9 px-3 sm:px-4 rounded-lg border border-[#FF5722]/70 text-[#FF5722] hover:bg-[#FF5722]/10 text-[11px] sm:text-xs font-bold inline-flex items-center gap-1 transition-all active:scale-95"
              >
                <Plus className="w-3.5 h-3.5" strokeWidth={3} />
                Подход
              </button>
            </div>
          </div>

          {/* Quick Time Adjustment & Preset Matrix */}
          <div className="mt-4 pt-4 border-t border-white/[0.07] dark:border-white/[0.07] space-y-2.5"
               style={{ borderColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)' }}>
            {/* Row 1: Fixed Presets */}
            <div>
              <div className="flex items-center justify-between mb-1.5 px-0.5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6B7280]">
                  Быстрый выбор времени
                </span>
                <span className="text-[11px] font-mono-tabular text-[#6B7280]">
                  Нажмите на цифры для ввода
                </span>
              </div>
              <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
                {PRESETS.map((preset) => {
                  const isSelected =
                    totalDurationMs === preset.seconds * 1000 &&
                    remainingMs === preset.seconds * 1000 &&
                    status === 'IDLE';
                  return (
                    <button
                      key={preset.seconds}
                      type="button"
                      onClick={() => handleSelectPreset(preset.seconds, preset.tag)}
                      className={`py-2 px-1 rounded-xl text-xs font-mono-tabular font-semibold transition-all active:scale-95 ${
                        isSelected
                          ? 'bg-[#FF5722] text-white shadow-sm'
                          : isDark
                            ? 'bg-[#1E2128] text-[#F3F4F6] hover:bg-[#272B35] tactile-key-dark'
                            : 'bg-[#F0F0EC] text-neutral-800 hover:bg-[#E5E5E0] tactile-key-light'
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Row 2: Relative Quick Modifiers (+15s, +30s, +1m, +5m, -30s, Clear) */}
            <div className="flex items-center justify-between gap-1.5 pt-0.5">
              <div className="grid grid-cols-5 gap-1.5 flex-1">
                {[
                  { label: '+15 сек', delta: 15 },
                  { label: '+30 сек', delta: 30 },
                  { label: '+1 мин', delta: 60 },
                  { label: '+5 мин', delta: 300 },
                  { label: '-30 сек', delta: -30 },
                ].map((mod) => (
                  <button
                    key={mod.label}
                    type="button"
                    disabled={mod.delta < 0 && remainingMs < 30000}
                    onClick={() => handleAddSeconds(mod.delta)}
                    className={`py-1.5 px-1 rounded-lg text-[11px] font-mono-tabular font-medium inline-flex items-center justify-center gap-0.5 border transition-all active:scale-95 disabled:opacity-35 disabled:pointer-events-none ${
                      isDark
                        ? 'bg-[#15171C] border-white/10 text-[#9CA3AF] hover:text-white hover:border-white/20 hover:bg-[#1E2128]'
                        : 'bg-neutral-50 border-black/10 text-neutral-600 hover:text-black hover:bg-neutral-100'
                    }`}
                  >
                    {mod.delta > 0 ? (
                      <Plus className="w-2.5 h-2.5 text-[#FF5722]" />
                    ) : (
                      <Minus className="w-2.5 h-2.5 text-[#9CA3AF]" />
                    )}
                    <span>{mod.label.replace(/^[+-]/, '')}</span>
                  </button>
                ))}
              </div>

              {/* Zero / Clear Button */}
              <button
                type="button"
                disabled={remainingMs === 0 && totalDurationMs === 0 && status === 'IDLE'}
                onClick={handleClearToZero}
                title="Обнулить таймер в 00:00:00"
                className={`py-1.5 px-2.5 rounded-lg text-[11px] font-mono-tabular font-medium inline-flex items-center gap-1 border transition-all active:scale-95 disabled:opacity-35 disabled:pointer-events-none ${
                  isDark
                    ? 'bg-[#15171C] border-white/10 text-[#9CA3AF] hover:text-[#EF4444] hover:border-[#EF4444]/40'
                    : 'bg-neutral-50 border-black/10 text-neutral-600 hover:text-[#EF4444] hover:border-[#EF4444]/40'
                }`}
              >
                <Trash2 className="w-3 h-3" />
                <span>00:00</span>
              </button>
            </div>
          </div>

          {/* Primary Transport Dock */}
          <div className="mt-5 flex items-center gap-2.5">
            {status === 'COMPLETED' ? (
              <>
                <button
                  type="button"
                  onClick={handleStartPause}
                  className="flex-1 h-14 rounded-2xl bg-[#EF4444] hover:bg-[#DC2626] text-white font-semibold text-base tracking-wide inline-flex items-center justify-center gap-2.5 shadow-lg shadow-[#EF4444]/30 transition-all active:scale-[0.98]"
                >
                  <BellOff className="w-5 h-5" />
                  <span>Остановить сигнал</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.stopAlarmLoop();
                    soundEngine.playClick('start', muted);
                    endTimeRef.current = Date.now() + totalDurationMs;
                    lastWholeSecondRef.current = Math.ceil(totalDurationMs / 1000);
                    setRemainingMs(totalDurationMs);
                    setStatus('RUNNING');
                  }}
                  className={`h-14 px-5 rounded-2xl font-semibold text-sm inline-flex items-center justify-center gap-2 transition-all active:scale-95 ${
                    isDark
                      ? 'bg-[#1E2128] text-white hover:bg-[#272B35] tactile-key-dark'
                      : 'bg-[#E5E5E0] text-neutral-900 hover:bg-[#D8D8D2] tactile-key-light'
                  }`}
                >
                  <RotateCcw className="w-4 h-4 text-[#FF5722]" />
                  <span>Повторить</span>
                </button>
              </>
            ) : (
              <>
                {/* Reset Button */}
                <button
                  type="button"
                  disabled={status === 'IDLE' && remainingMs === 0}
                  onClick={handleReset}
                  title="Сбросить к начальному времени (Клавиша R)"
                  className={`h-14 px-5 rounded-2xl font-semibold text-sm inline-flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-40 disabled:pointer-events-none ${
                    isDark
                      ? 'bg-[#1E2128] text-[#F3F4F6] hover:bg-[#272B35] tactile-key-dark'
                      : 'bg-[#EAEAE5] text-neutral-800 hover:bg-[#DFDFD9] tactile-key-light'
                  }`}
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Сброс</span>
                </button>

                {/* Primary Hero Start / Pause Button */}
                <button
                  type="button"
                  disabled={!canStart}
                  onClick={handleStartPause}
                  className={`flex-1 h-14 rounded-2xl font-bold text-base tracking-[0.02em] inline-flex items-center justify-center gap-2.5 transition-all active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none ${
                    status === 'RUNNING'
                      ? isDark
                        ? 'bg-[#FFB300] text-[#0C0D10] hover:bg-[#FFA000] shadow-lg shadow-[#FFB300]/25'
                        : 'bg-[#FFB300] text-neutral-950 hover:bg-[#FFA000] shadow-lg shadow-[#FFB300]/30'
                      : 'bg-[#FF5722] text-white tactile-orange-btn'
                  }`}
                >
                  {status === 'RUNNING' ? (
                    <>
                      <Pause className="w-5 h-5 fill-current" />
                      <span>Пауза</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-5 h-5 fill-current" />
                      <span>{status === 'PAUSED' ? 'Продолжить' : 'Старт'}</span>
                    </>
                  )}
                </button>

                {/* Auto-Repeat Cycle Toggle */}
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.playClick('soft', muted);
                    setAutoRepeat((r) => !r);
                  }}
                  title={
                    autoRepeat
                      ? 'Автоповтор включён: таймер перезапустится автоматически'
                      : 'Включить автоповтор таймера по кругу'
                  }
                  className={`h-14 w-14 rounded-2xl flex flex-col items-center justify-center gap-0.5 transition-all active:scale-95 ${
                    autoRepeat
                      ? 'bg-[#FF5722]/20 text-[#FF5722] border border-[#FF5722]/50'
                      : isDark
                        ? 'bg-[#1E2128] text-[#9CA3AF] hover:text-white hover:bg-[#272B35] tactile-key-dark'
                        : 'bg-[#EAEAE5] text-neutral-600 hover:text-neutral-900 hover:bg-[#DFDFD9] tactile-key-light'
                  }`}
                >
                  <Repeat className="w-4 h-4" />
                  <span className="text-[9px] font-semibold uppercase tracking-tight">
                    Цикл
                  </span>
                </button>
              </>
            )}
          </div>
        </div>
      </main>

      {/* Bottom Keyboard Shortcuts Hint Bar */}
      <footer className="w-full max-w-[540px] mx-auto pt-2 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-[11px] text-[#6B7280]">
        <div className="inline-flex items-center gap-1.5">
          <kbd
            className={`px-1.5 py-0.5 rounded text-[10px] font-mono-tabular border ${
              isDark
                ? 'bg-[#15171C] border-white/10 text-[#9CA3AF]'
                : 'bg-white border-black/10 text-neutral-600'
            }`}
          >
            Пробел
          </kbd>
          <span>Старт / Пауза</span>
        </div>
        <div className="inline-flex items-center gap-1.5">
          <kbd
            className={`px-1.5 py-0.5 rounded text-[10px] font-mono-tabular border ${
              isDark
                ? 'bg-[#15171C] border-white/10 text-[#9CA3AF]'
                : 'bg-white border-black/10 text-neutral-600'
            }`}
          >
            R
          </kbd>
          <span>Сброс</span>
        </div>
        <div className="inline-flex items-center gap-1.5">
          <kbd
            className={`px-1.5 py-0.5 rounded text-[10px] font-mono-tabular border ${
              isDark
                ? 'bg-[#15171C] border-white/10 text-[#9CA3AF]'
                : 'bg-white border-black/10 text-neutral-600'
            }`}
          >
            M
          </kbd>
          <span>Звук</span>
        </div>
        <div className="inline-flex items-center gap-1.5">
          <kbd
            className={`px-1.5 py-0.5 rounded text-[10px] font-mono-tabular border ${
              isDark
                ? 'bg-[#15171C] border-white/10 text-[#9CA3AF]'
                : 'bg-white border-black/10 text-neutral-600'
            }`}
          >
            S
          </kbd>
          <span>+1 Подход</span>
        </div>
        <div className="inline-flex items-center gap-1.5">
          <kbd
            className={`px-1.5 py-0.5 rounded text-[10px] font-mono-tabular border ${
              isDark
                ? 'bg-[#15171C] border-white/10 text-[#9CA3AF]'
                : 'bg-white border-black/10 text-neutral-600'
            }`}
          >
            Колёсико / Цифры
          </kbd>
          <span>Настройка ЧЧ:ММ:СС</span>
        </div>
      </footer>
    </div>
  );
}

export default App;
