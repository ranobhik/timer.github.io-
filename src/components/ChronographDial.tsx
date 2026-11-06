import React, { useState, useEffect, useRef } from 'react';
import { ChevronUp, ChevronDown, BellRing, Clock, Edit3, Check } from 'lucide-react';

export type TimerStatus = 'IDLE' | 'RUNNING' | 'PAUSED' | 'COMPLETED';
export type TimeSegment = 'hours' | 'minutes' | 'seconds' | null;

interface ChronographDialProps {
  status: TimerStatus;
  remainingMs: number;
  totalDurationMs: number;
  isDark: boolean;
  label: string;
  onLabelChange: (newLabel: string) => void;
  onAdjustSegment: (segment: 'hours' | 'minutes' | 'seconds', delta: number) => void;
  onSetSegmentValue: (segment: 'hours' | 'minutes' | 'seconds', value: number) => void;
  selectedSegment: TimeSegment;
  onSelectSegment: (segment: TimeSegment) => void;
}

const QUICK_LABELS = ['Фокус', 'Кухня', 'Чай / Кофе', 'Тренировка', 'Перерыв'];

export const ChronographDial: React.FC<ChronographDialProps> = ({
  status,
  remainingMs,
  totalDurationMs,
  isDark,
  label,
  onLabelChange,
  onAdjustSegment,
  onSetSegmentValue,
  selectedSegment,
  onSelectSegment,
}) => {
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelDraft, setLabelDraft] = useState(label);
  const [digitBuffer, setDigitBuffer] = useState<string>('');
  const labelInputRef = useRef<HTMLInputElement>(null);

  // Reset digit buffer when selectedSegment changes
  useEffect(() => {
    setDigitBuffer('');
  }, [selectedSegment, status]);

  useEffect(() => {
    if (editingLabel && labelInputRef.current) {
      labelInputRef.current.focus();
      labelInputRef.current.select();
    }
  }, [editingLabel]);

  // Calculate hours, minutes, seconds, tenths
  const displayMs = Math.max(0, remainingMs);
  const totalSeconds = status === 'RUNNING' ? Math.ceil(displayMs / 1000) : Math.round(displayMs / 1000);

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const tenths = Math.floor((displayMs % 1000) / 100);

  const pad2 = (n: number) => String(Math.max(0, Math.min(99, n))).padStart(2, '0');

  const isWarning = status === 'RUNNING' && totalSeconds <= 10 && totalSeconds > 0;
  const isEditable = status === 'IDLE' || status === 'PAUSED';

  // Progress calculation (1.0 when full, 0.0 when completed)
  const progress =
    totalDurationMs > 0
      ? Math.max(0, Math.min(1, remainingMs / totalDurationMs))
      : 0;

  // Estimated finish wall-clock time
  const finishTimeStr = React.useMemo(() => {
    if (status !== 'RUNNING' || remainingMs <= 0) return null;
    const finishDate = new Date(Date.now() + remainingMs);
    return finishDate.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }, [status, Math.floor(remainingMs / 1000)]);

  // Handle keyboard numeric entry when a segment is focused
  useEffect(() => {
    if (!isEditable || !selectedSegment) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (editingLabel) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        const nextBuffer = (digitBuffer + e.key).slice(-2);
        setDigitBuffer(nextBuffer);
        const numericVal = parseInt(nextBuffer, 10);
        const maxVal = selectedSegment === 'hours' ? 99 : 59;
        onSetSegmentValue(selectedSegment, Math.min(maxVal, numericVal));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        onAdjustSegment(selectedSegment, 1);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        onAdjustSegment(selectedSegment, -1);
      } else if (e.key === 'ArrowRight' || e.key === 'Tab') {
        if (e.key === 'ArrowRight') e.preventDefault();
        if (selectedSegment === 'hours') onSelectSegment('minutes');
        else if (selectedSegment === 'minutes') onSelectSegment('seconds');
        else if (selectedSegment === 'seconds') onSelectSegment('hours');
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (selectedSegment === 'seconds') onSelectSegment('minutes');
        else if (selectedSegment === 'minutes') onSelectSegment('hours');
        else if (selectedSegment === 'hours') onSelectSegment('seconds');
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        setDigitBuffer('');
        onSetSegmentValue(selectedSegment, 0);
      } else if (e.key === 'Escape' || e.key === 'Enter') {
        if (e.key === 'Escape') {
          e.preventDefault();
          onSelectSegment(null);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEditable, selectedSegment, digitBuffer, editingLabel, onAdjustSegment, onSetSegmentValue, onSelectSegment]);

  // Handle mouse wheel over segments
  const handleWheel = (segment: 'hours' | 'minutes' | 'seconds') => (e: React.WheelEvent) => {
    if (!isEditable) return;
    e.preventDefault();
    const delta = e.deltaY < 0 ? 1 : -1;
    onAdjustSegment(segment, delta);
  };

  // SVG Ring geometry
  const size = 380;
  const center = size / 2;
  const radius = 162;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - progress);

  // Active stroke color
  const getRingColor = () => {
    if (status === 'COMPLETED') return '#EF4444';
    if (isWarning) return '#F59E0B';
    if (status === 'RUNNING') return 'url(#braunOrangeGradient)';
    if (status === 'PAUSED') return '#FFB300';
    return totalDurationMs > 0 ? '#FF5722' : isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.12)';
  };

  // Calculate position of the glowing tip dot on the SVG circle
  const angleRad = (progress * 360 - 90) * (Math.PI / 180);
  const tipX = center + radius * Math.cos(angleRad);
  const tipY = center + radius * Math.sin(angleRad);

  const saveLabel = () => {
    setEditingLabel(false);
    onLabelChange(labelDraft.trim());
  };

  return (
    <div className="relative flex flex-col items-center justify-center select-none">
      {/* Main Circular Instrument Dial */}
      <div className="relative w-[310px] h-[310px] sm:w-[376px] sm:h-[376px] flex items-center justify-center">
        <svg
          viewBox={`0 0 ${size} ${size}`}
          className="w-full h-full overflow-visible"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="braunOrangeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FF5722" />
              <stop offset="100%" stopColor="#FFB300" />
            </linearGradient>
            <filter id="glowFilter" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* 60 Precision Chronograph Tick Marks */}
          {Array.from({ length: 60 }).map((_, i) => {
            const isMajor = i % 5 === 0;
            const tickAngle = (i * 6 - 90) * (Math.PI / 180);
            const outerR = 182;
            const innerR = isMajor ? 173 : 177;
            const x1 = center + innerR * Math.cos(tickAngle);
            const y1 = center + innerR * Math.sin(tickAngle);
            const x2 = center + outerR * Math.cos(tickAngle);
            const y2 = center + outerR * Math.sin(tickAngle);

            const tickProgressIndex = Math.round(progress * 60);
            const isLit = totalDurationMs > 0 && i < tickProgressIndex;

            let strokeColor = isDark
              ? isMajor
                ? 'rgba(255,255,255,0.22)'
                : 'rgba(255,255,255,0.08)'
              : isMajor
                ? 'rgba(0,0,0,0.25)'
                : 'rgba(0,0,0,0.1)';

            if (status === 'COMPLETED') {
              strokeColor = isMajor ? '#EF4444' : 'rgba(239, 68, 68, 0.45)';
            } else if (isLit && status === 'RUNNING') {
              strokeColor = isWarning
                ? '#F59E0B'
                : isMajor
                  ? '#FF5722'
                  : 'rgba(255, 87, 34, 0.45)';
            }

            return (
              <line
                key={i}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={strokeColor}
                strokeWidth={isMajor ? 2 : 1.2}
                strokeLinecap="round"
                className="transition-colors duration-200"
              />
            );
          })}

          {/* Track Ring Background */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.07)'}
            strokeWidth={7}
          />

          {/* Active Radial Progress Arc */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={getRingColor()}
            strokeWidth={status === 'COMPLETED' ? 8 : 7}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={status === 'COMPLETED' ? 0 : strokeDashoffset}
            transform={`rotate(-90 ${center} ${center})`}
            style={{
              transition:
                status === 'RUNNING'
                  ? 'stroke-dashoffset 80ms linear, stroke 300ms ease'
                  : 'stroke-dashoffset 320ms cubic-bezier(0.22, 1, 0.36, 1), stroke 300ms ease',
            }}
            filter={status === 'RUNNING' || status === 'COMPLETED' ? 'url(#glowFilter)' : undefined}
          />

          {/* Glowing Indicator Tip Dot on Progress Ring */}
          {totalDurationMs > 0 && progress > 0.005 && status !== 'COMPLETED' && (
            <circle
              cx={tipX}
              cy={tipY}
              r={5.5}
              fill={isWarning ? '#F59E0B' : '#FF5722'}
              stroke={isDark ? '#0C0D10' : '#FFFFFF'}
              strokeWidth={2}
              style={{
                transition:
                  status === 'RUNNING'
                    ? 'cx 80ms linear, cy 80ms linear'
                    : 'cx 320ms cubic-bezier(0.22, 1, 0.36, 1), cy 320ms cubic-bezier(0.22, 1, 0.36, 1)',
              }}
            />
          )}
        </svg>

        {/* Central Instrument Readout Overlay */}
        <div className="absolute inset-0 flex flex-col items-center justify-between py-7 sm:py-9 px-4">
          {/* Top Status Pill & Task Label */}
          <div className="flex flex-col items-center gap-1.5 z-10">
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-[0.09em] transition-colors ${
                  status === 'COMPLETED'
                    ? 'bg-[#EF4444]/20 text-[#EF4444] border border-[#EF4444]/40 animate-pulse'
                    : isWarning
                      ? 'bg-[#F59E0B]/20 text-[#F59E0B] border border-[#F59E0B]/40'
                      : status === 'RUNNING'
                        ? 'bg-[#FF5722]/15 text-[#FF5722] border border-[#FF5722]/30'
                        : status === 'PAUSED'
                          ? 'bg-[#FFB300]/15 text-[#FFB300] border border-[#FFB300]/30'
                          : totalDurationMs > 0
                            ? 'bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30'
                            : isDark
                              ? 'bg-white/5 text-[#9CA3AF] border border-white/10'
                              : 'bg-black/5 text-neutral-600 border border-black/10'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    status === 'COMPLETED'
                      ? 'bg-[#EF4444] animate-ping'
                      : isWarning
                        ? 'bg-[#F59E0B] animate-ping'
                        : status === 'RUNNING'
                          ? 'bg-[#FF5722]'
                          : status === 'PAUSED'
                            ? 'bg-[#FFB300]'
                            : totalDurationMs > 0
                              ? 'bg-[#10B981]'
                              : 'bg-neutral-500'
                  }`}
                />
                {status === 'COMPLETED'
                  ? 'Время вышло!'
                  : isWarning
                    ? 'Финальный отсчёт'
                    : status === 'RUNNING'
                      ? 'Идёт отсчёт'
                      : status === 'PAUSED'
                        ? 'На паузе'
                        : totalDurationMs > 0
                          ? 'Готов к старту'
                          : 'Задайте время'}
              </span>
            </div>

            {/* Editable Timer Label / Task Name */}
            {editingLabel ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  saveLabel();
                }}
                className="flex items-center gap-1 mt-0.5"
              >
                <input
                  ref={labelInputRef}
                  type="text"
                  value={labelDraft}
                  maxLength={24}
                  onChange={(e) => setLabelDraft(e.target.value)}
                  onBlur={saveLabel}
                  placeholder="Название таймера..."
                  className={`w-36 sm:w-44 text-center text-xs font-medium px-2 py-0.5 rounded border outline-none ${
                    isDark
                      ? 'bg-[#1E2128] text-white border-[#FF5722]/60'
                      : 'bg-white text-neutral-900 border-[#FF5722]'
                  }`}
                />
                <button
                  type="submit"
                  className="p-0.5 text-[#10B981] hover:opacity-80"
                  title="Сохранить название"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setLabelDraft(label);
                  setEditingLabel(true);
                }}
                className={`group inline-flex items-center gap-1 text-xs font-medium transition-colors px-2 py-0.5 rounded-md ${
                  isDark
                    ? 'text-[#9CA3AF] hover:text-white hover:bg-white/5'
                    : 'text-neutral-500 hover:text-neutral-900 hover:bg-black/5'
                }`}
                title="Нажмите, чтобы подписать таймер"
              >
                <span>{label || 'Добавить метку'}</span>
                <Edit3 className="w-3 h-3 opacity-50 group-hover:opacity-100 transition-opacity" />
              </button>
            )}
          </div>

          {/* Center Hero Time Readout (HH : MM : SS) */}
          <div className="flex flex-col items-center justify-center my-auto z-10">
            <div className="flex items-center justify-center gap-0.5 sm:gap-1.5">
              {/* HOURS SEGMENT */}
              <div
                onWheel={handleWheel('hours')}
                className="flex flex-col items-center"
              >
                {isEditable ? (
                  <button
                    type="button"
                    onClick={() => onAdjustSegment('hours', 1)}
                    className={`p-1 rounded-md transition-all active:scale-90 ${
                      isDark
                        ? 'text-[#9CA3AF] hover:text-white hover:bg-white/10'
                        : 'text-neutral-500 hover:text-neutral-900 hover:bg-black/10'
                    }`}
                    aria-label="Увеличить часы"
                    title="+1 час (или крутите колесико мыши)"
                  >
                    <ChevronUp className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>
                ) : (
                  <div className="h-6 sm:h-7" />
                )}

                <button
                  type="button"
                  disabled={!isEditable}
                  onClick={() =>
                    isEditable &&
                    onSelectSegment(selectedSegment === 'hours' ? null : 'hours')
                  }
                  title={
                    isEditable
                      ? 'Нажмите для ввода часов с клавиатуры или крутите колесико'
                      : undefined
                  }
                  className={`font-mono-tabular text-[2.75rem] sm:text-[3.65rem] font-bold leading-none tracking-[-0.04em] px-1.5 py-1 rounded-xl transition-all ${
                    selectedSegment === 'hours' && isEditable
                      ? 'bg-[#FF5722]/20 text-[#FF5722] ring-2 ring-[#FF5722]/70'
                      : status === 'COMPLETED'
                        ? 'text-[#EF4444]'
                        : isWarning
                          ? 'text-[#F59E0B]'
                          : isDark
                            ? 'text-[#F3F4F6] hover:bg-white/5'
                            : 'text-neutral-900 hover:bg-black/5'
                  } ${!isEditable ? 'cursor-default' : 'cursor-pointer'}`}
                >
                  {pad2(hours)}
                </button>

                <span
                  className={`text-[10px] font-semibold uppercase tracking-[0.08em] mt-0.5 ${
                    selectedSegment === 'hours' && isEditable
                      ? 'text-[#FF5722]'
                      : 'text-[#6B7280]'
                  }`}
                >
                  Часы
                </span>

                {isEditable ? (
                  <button
                    type="button"
                    onClick={() => onAdjustSegment('hours', -1)}
                    className={`p-1 rounded-md transition-all active:scale-90 ${
                      isDark
                        ? 'text-[#9CA3AF] hover:text-white hover:bg-white/10'
                        : 'text-neutral-500 hover:text-neutral-900 hover:bg-black/10'
                    }`}
                    aria-label="Уменьшить часы"
                    title="-1 час"
                  >
                    <ChevronDown className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>
                ) : (
                  <div className="h-6 sm:h-7" />
                )}
              </div>

              {/* COLON SEPARATOR */}
              <span
                className={`font-mono-tabular text-[2.4rem] sm:text-[3.2rem] font-bold leading-none -mt-3 select-none ${
                  status === 'RUNNING' ? 'colon-running text-[#FF5722]' : 'text-[#6B7280]/60'
                }`}
              >
                :
              </span>

              {/* MINUTES SEGMENT */}
              <div
                onWheel={handleWheel('minutes')}
                className="flex flex-col items-center"
              >
                {isEditable ? (
                  <button
                    type="button"
                    onClick={() => onAdjustSegment('minutes', 1)}
                    className={`p-1 rounded-md transition-all active:scale-90 ${
                      isDark
                        ? 'text-[#9CA3AF] hover:text-white hover:bg-white/10'
                        : 'text-neutral-500 hover:text-neutral-900 hover:bg-black/10'
                    }`}
                    aria-label="Увеличить минуты"
                    title="+1 минута (или крутите колесико мыши)"
                  >
                    <ChevronUp className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>
                ) : (
                  <div className="h-6 sm:h-7" />
                )}

                <button
                  type="button"
                  disabled={!isEditable}
                  onClick={() =>
                    isEditable &&
                    onSelectSegment(selectedSegment === 'minutes' ? null : 'minutes')
                  }
                  title={
                    isEditable
                      ? 'Нажмите для ввода минут с клавиатуры или крутите колесико'
                      : undefined
                  }
                  className={`font-mono-tabular text-[2.75rem] sm:text-[3.65rem] font-bold leading-none tracking-[-0.04em] px-1.5 py-1 rounded-xl transition-all ${
                    selectedSegment === 'minutes' && isEditable
                      ? 'bg-[#FF5722]/20 text-[#FF5722] ring-2 ring-[#FF5722]/70'
                      : status === 'COMPLETED'
                        ? 'text-[#EF4444]'
                        : isWarning
                          ? 'text-[#F59E0B]'
                          : isDark
                            ? 'text-[#F3F4F6] hover:bg-white/5'
                            : 'text-neutral-900 hover:bg-black/5'
                  } ${!isEditable ? 'cursor-default' : 'cursor-pointer'}`}
                >
                  {pad2(minutes)}
                </button>

                <span
                  className={`text-[10px] font-semibold uppercase tracking-[0.08em] mt-0.5 ${
                    selectedSegment === 'minutes' && isEditable
                      ? 'text-[#FF5722]'
                      : 'text-[#6B7280]'
                  }`}
                >
                  Мин
                </span>

                {isEditable ? (
                  <button
                    type="button"
                    onClick={() => onAdjustSegment('minutes', -1)}
                    className={`p-1 rounded-md transition-all active:scale-90 ${
                      isDark
                        ? 'text-[#9CA3AF] hover:text-white hover:bg-white/10'
                        : 'text-neutral-500 hover:text-neutral-900 hover:bg-black/10'
                    }`}
                    aria-label="Уменьшить минуты"
                    title="-1 минута"
                  >
                    <ChevronDown className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>
                ) : (
                  <div className="h-6 sm:h-7" />
                )}
              </div>

              {/* COLON SEPARATOR */}
              <span
                className={`font-mono-tabular text-[2.4rem] sm:text-[3.2rem] font-bold leading-none -mt-3 select-none ${
                  status === 'RUNNING' ? 'colon-running text-[#FF5722]' : 'text-[#6B7280]/60'
                }`}
              >
                :
              </span>

              {/* SECONDS SEGMENT */}
              <div
                onWheel={handleWheel('seconds')}
                className="flex flex-col items-center"
              >
                {isEditable ? (
                  <button
                    type="button"
                    onClick={() => onAdjustSegment('seconds', 1)}
                    className={`p-1 rounded-md transition-all active:scale-90 ${
                      isDark
                        ? 'text-[#9CA3AF] hover:text-white hover:bg-white/10'
                        : 'text-neutral-500 hover:text-neutral-900 hover:bg-black/10'
                    }`}
                    aria-label="Увеличить секунды"
                    title="+1 секунда (или крутите колесико мыши)"
                  >
                    <ChevronUp className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>
                ) : (
                  <div className="h-6 sm:h-7" />
                )}

                <div className="relative flex items-baseline">
                  <button
                    type="button"
                    disabled={!isEditable}
                    onClick={() =>
                      isEditable &&
                      onSelectSegment(selectedSegment === 'seconds' ? null : 'seconds')
                    }
                    title={
                      isEditable
                        ? 'Нажмите для ввода секунд с клавиатуры или крутите колесико'
                        : undefined
                    }
                    className={`font-mono-tabular text-[2.75rem] sm:text-[3.65rem] font-bold leading-none tracking-[-0.04em] px-1.5 py-1 rounded-xl transition-all ${
                      selectedSegment === 'seconds' && isEditable
                        ? 'bg-[#FF5722]/20 text-[#FF5722] ring-2 ring-[#FF5722]/70'
                        : status === 'COMPLETED'
                          ? 'text-[#EF4444]'
                          : isWarning
                            ? 'text-[#F59E0B]'
                            : isDark
                              ? 'text-[#F3F4F6] hover:bg-white/5'
                              : 'text-neutral-900 hover:bg-black/5'
                    } ${!isEditable ? 'cursor-default' : 'cursor-pointer'}`}
                  >
                    {pad2(seconds)}
                  </button>

                  {/* Sub-second tenth readout when running */}
                  {status === 'RUNNING' && (
                    <span className="font-mono-tabular text-xs sm:text-sm font-semibold text-[#9CA3AF] ml-0.5">
                      .{tenths}
                    </span>
                  )}
                </div>

                <span
                  className={`text-[10px] font-semibold uppercase tracking-[0.08em] mt-0.5 ${
                    selectedSegment === 'seconds' && isEditable
                      ? 'text-[#FF5722]'
                      : 'text-[#6B7280]'
                  }`}
                >
                  Сек
                </span>

                {isEditable ? (
                  <button
                    type="button"
                    onClick={() => onAdjustSegment('seconds', -1)}
                    className={`p-1 rounded-md transition-all active:scale-90 ${
                      isDark
                        ? 'text-[#9CA3AF] hover:text-white hover:bg-white/10'
                        : 'text-neutral-500 hover:text-neutral-900 hover:bg-black/10'
                    }`}
                    aria-label="Уменьшить секунды"
                    title="-1 секунда"
                  >
                    <ChevronDown className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>
                ) : (
                  <div className="h-6 sm:h-7" />
                )}
              </div>
            </div>
          </div>

          {/* Bottom Sub-Readout Info inside Dial */}
          <div className="flex flex-col items-center justify-center min-h-[28px] z-10">
            {status === 'COMPLETED' ? (
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[#EF4444] animate-bounce">
                <BellRing className="w-3.5 h-3.5" />
                <span>Таймер завершён!</span>
              </div>
            ) : selectedSegment && isEditable ? (
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#FF5722]">
                <span>Введите число с клавиатуры или ↑↓</span>
              </div>
            ) : status === 'RUNNING' && finishTimeStr ? (
              <div
                className={`flex items-center gap-3 text-xs font-mono-tabular ${
                  isDark ? 'text-[#9CA3AF]' : 'text-neutral-600'
                }`}
              >
                <span className="inline-flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-[#FF5722]" />
                  До {finishTimeStr}
                </span>
                <span className="opacity-40">•</span>
                <span>{Math.round((1 - progress) * 100)}%</span>
              </div>
            ) : (
              <div className="flex items-center gap-1 flex-wrap justify-center">
                {QUICK_LABELS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => onLabelChange(label === item ? '' : item)}
                    className={`px-2 py-0.5 rounded text-[10px] font-medium transition-all ${
                      label === item
                        ? 'bg-[#FF5722]/20 text-[#FF5722] border border-[#FF5722]/40'
                        : isDark
                          ? 'text-[#6B7280] hover:text-[#9CA3AF] hover:bg-white/5'
                          : 'text-neutral-500 hover:text-neutral-800 hover:bg-black/5'
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
