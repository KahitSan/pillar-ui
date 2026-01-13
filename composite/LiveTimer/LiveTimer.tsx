import { splitProps, createSignal, onCleanup, createMemo } from 'solid-js';
import Clock from 'lucide-solid/icons/clock';
import Play from 'lucide-solid/icons/play';
import AlertTriangle from 'lucide-solid/icons/alert-triangle';
import Check from 'lucide-solid/icons/check';
import Calendar from 'lucide-solid/icons/calendar';
import ProgressBar from '../../base/ProgressBar/ProgressBar';

// @ts-ignore
export interface LiveTimerProps extends Omit<JSX.HTMLAttributes<HTMLDivElement>, 'class'> {
  // Core timing
  startAt: Date; // Required start date/time
  endAt?: Date; // Optional end date/time
  overdue?: boolean; // Allow counting past endAt
  updateInterval?: number; // Update frequency in milliseconds (default: 10000 = 10 seconds)
  
  // @ts-ignore Display options
  icon?: Component<{ size: number; class?: string }>; // Custom icon override
  
  // Styling
  class?: string; // Custom classes for the ProgressBar
}

// Centralized ticker - updates every 10 seconds by default to reduce overhead
let globalTickSignal: (() => number) | null = null;
let globalIntervalId: number | undefined | any = null;
let subscriberCount = 0;
let updateInterval = 10000; // Default 10 seconds

function getGlobalTick(interval: number = 10000): () => number {
  if (!globalTickSignal) {
    updateInterval = interval;
    const [currentTick, setCurrentTick] = createSignal(Date.now());
    globalTickSignal = currentTick;
    
    globalIntervalId = setInterval(() => {
      setCurrentTick(Date.now());
    }, updateInterval);
  }
  
  subscriberCount++;
  
  // Cleanup when last subscriber unmounts
  onCleanup(() => {
    subscriberCount--;
    if (subscriberCount === 0 && globalIntervalId) {
      clearInterval(globalIntervalId);
      globalIntervalId = null;
      globalTickSignal = null;
    }
  });
  
  return globalTickSignal;
}

// Utility to safely convert to Date object
function ensureDate(value: any): Date | undefined {
  if (!value) return undefined;
  
  // If it's already a Date object, return it
  if (value instanceof Date) return value;
  
  // If it's a string or number, try to convert
  try {
    const date = new Date(value);
    // Check if the date is valid
    if (isNaN(date.getTime())) return undefined;
    return date;
  } catch {
    return undefined;
  }
}

// Optimized formatting - uses lookup for padding
const padZero = ['00', '01', '02', '03', '04', '05', '06', '07', '08', '09'];
function pad2(n: number): string {
  return n < 10 ? padZero[n] : String(n);
}

// Utility to format time as HH:MM:SS - optimized
function formatTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;
}

// Utility to format duration as human readable
function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

// @ts-ignore
const LiveTimer: Component<LiveTimerProps> = (props) => {
  const [local, others] = splitProps(props, [
    'startAt',
    'endAt', 
    'overdue',
    'icon',
    'class',
    'updateInterval'
  ]);

  // Use shared global tick with configurable interval
  const currentTick = getGlobalTick(local.updateInterval || 10000);
  
  // Pre-compute timestamps once - only recompute when props change
  const timestamps = createMemo(() => {
    const start = ensureDate(local.startAt);
    const end = ensureDate(local.endAt);
    
    if (!start) {
      throw new Error('startAt must be a valid Date object or date string');
    }
    
    // Store as milliseconds for faster math
    return {
      startMs: start.getTime(),
      endMs: end ? end.getTime() : null
    };
  });

  // Determine current scenario and calculate values - optimized calculations
  const timerState = createMemo(() => {
    const nowMs = currentTick();
    const { startMs, endMs } = timestamps();
    
    // Convert to seconds for calculations
    const nowSec = Math.floor(nowMs / 1000);
    const startSec = Math.floor(startMs / 1000);
    const endSec = endMs ? Math.floor(endMs / 1000) : null;

    // Scenario: Current time <= StartAt (countdown to start)
    if (nowSec <= startSec) {
      const remainingSeconds = startSec - nowSec;
      return {
        statusLabel: formatTime(remainingSeconds),
        progress: Math.min(100, (remainingSeconds / 3600) * 100),
        position: 'right' as const,
        colorClass: 'border border-blue-600/60 text-blue-400 hover:border-blue-500',
        label: 'before start',
        hidePercentage: false,
        shimmer: false,
        icon: local.icon || Calendar
      };
    }

    // Scenario: Current time >= StartAt AND EndAt is NOT set (open timer)
    if (endSec === null) {
      const elapsedSeconds = nowSec - startSec;
      return {
        statusLabel: formatTime(elapsedSeconds),
        progress: 95,
        position: 'left' as const,
        colorClass: 'border border-green-600/60 text-green-400 hover:border-green-500',
        label: 'Open time',
        hidePercentage: true,
        shimmer: true,
        icon: local.icon || Play
      };
    }

    // Calculate timing info for scenarios with endAt
    const totalDuration = endSec - startSec;
    const isCompleted = nowSec >= endSec;
    
    // Scenario: Overdue (past endAt with overdue enabled)
    if (isCompleted && local.overdue) {
      const overdueSeconds = nowSec - endSec;
      const overduePercent = totalDuration > 0 ? (overdueSeconds / totalDuration) * 100 : 0;
      
      return {
        statusLabel: formatTime(overdueSeconds),
        progress: 100 + overduePercent,
        position: 'left' as const,
        colorClass: 'border border-red-600/60 text-red-400 hover:border-red-500',
        label: 'Overdue',
        hidePercentage: false,
        shimmer: false,
        icon: local.icon || AlertTriangle
      };
    }
    
    // Scenario: Completed (past endAt without overdue)
    if (isCompleted) {
      return {
        statusLabel: formatDuration(totalDuration),
        progress: 100,
        position: 'left' as const,
        colorClass: 'border border-gray-600/60 text-gray-400 hover:border-gray-500',
        label: 'Completed',
        hidePercentage: false,
        shimmer: false,
        icon: local.icon || Check
      };
    }

    // Scenario: Active countdown timer
    const remainingSeconds = endSec - nowSec;
    const elapsedSeconds = totalDuration - remainingSeconds;
    const progressPercent = totalDuration > 0 ? (elapsedSeconds / totalDuration) * 100 : 100;

    // Dynamic color based on progress - use ternary instead of if-else
    const colorClass =
      progressPercent <= 25
        ? 'border border-green-600/60 text-green-400 hover:border-green-500'
        : progressPercent <= 75
        ? 'border border-amber-600/60 text-amber-400 hover:border-amber-500'
        : 'border border-red-600/60 text-red-400 hover:border-red-500';

    return {
      statusLabel: formatTime(remainingSeconds),
      progress: Math.min(100, progressPercent),
      position: 'left' as const,
      colorClass,
      label: 'Remaining',
      hidePercentage: false,
      shimmer: false,
      icon: local.icon || Clock
    };
  });

  // Merge user classes with dynamic color classes
  const finalClass = createMemo(() => {
    const state = timerState();
    const userClasses = local.class || '';
    
    // If user provided border and text colors, use their classes completely
    if (userClasses.includes('border-') && userClasses.includes('text-')) {
      return userClasses;
    }
    
    // Merge user classes with dynamic color theme
    return `${state.colorClass} ${userClasses}`.trim();
  });

  return (
    <ProgressBar
      progress={timerState().progress}
      icon={timerState().icon}
      statusLabel={timerState().statusLabel}
      label={timerState().label}
      position={timerState().position}
      hidePercentage={timerState().hidePercentage}
      shimmer={timerState().shimmer}
      class={finalClass()}
      {...others}
    />
  );
};

export default LiveTimer;
