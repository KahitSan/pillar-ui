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
  
  // @ts-ignore Display options
  icon?: Component<{ size: number; class?: string }>; // Custom icon override
  
  // Styling
  class?: string; // Custom classes for the ProgressBar
}

// Fast ticker for time display - updates every 1 second (lightweight)
let fastTickSignal: (() => number) | null = null;
let fastIntervalId: number | undefined | any = null;
let fastSubscriberCount = 0;

function getFastTick(): () => number {
  if (!fastTickSignal) {
    const [currentTick, setCurrentTick] = createSignal(Date.now());
    fastTickSignal = currentTick;
    
    fastIntervalId = setInterval(() => {
      setCurrentTick(Date.now());
    }, 1000); // 1 second for smooth time display
  }
  
  fastSubscriberCount++;
  
  onCleanup(() => {
    fastSubscriberCount--;
    if (fastSubscriberCount === 0 && fastIntervalId) {
      clearInterval(fastIntervalId);
      fastIntervalId = null;
      fastTickSignal = null;
    }
  });
  
  return fastTickSignal;
}

// Slow ticker for heavy calculations - updates every 10 seconds (performance)
let slowTickSignal: (() => number) | null = null;
let slowIntervalId: number | undefined | any = null;
let slowSubscriberCount = 0;

function getSlowTick(): () => number {
  if (!slowTickSignal) {
    const [currentTick, setCurrentTick] = createSignal(Date.now());
    slowTickSignal = currentTick;
    
    slowIntervalId = setInterval(() => {
      setCurrentTick(Date.now());
    }, 10000); // 10 seconds for heavy calculations
  }
  
  slowSubscriberCount++;
  
  onCleanup(() => {
    slowSubscriberCount--;
    if (slowSubscriberCount === 0 && slowIntervalId) {
      clearInterval(slowIntervalId);
      slowIntervalId = null;
      slowTickSignal = null;
    }
  });
  
  return slowTickSignal;
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

// Scenario type constants - use numbers for faster comparison
const SCENARIO_COUNTDOWN_TO_START = 0;
const SCENARIO_OPEN_TIMER = 1;
const SCENARIO_OVERDUE = 2;
const SCENARIO_COMPLETED = 3;
const SCENARIO_COUNTDOWN_TIMER = 4;

// Pre-defined static scenario configs to avoid object creation
const SCENARIO_CONFIGS = {
  [SCENARIO_COUNTDOWN_TO_START]: {
    position: 'right' as const,
    colorClass: 'border border-blue-600/60 text-blue-400 hover:border-blue-500',
    label: 'before start',
    hidePercentage: false,
    shimmer: false,
  },
  [SCENARIO_OPEN_TIMER]: {
    position: 'left' as const,
    colorClass: 'border border-green-600/60 text-green-400 hover:border-green-500',
    label: 'Open time',
    hidePercentage: true,
    shimmer: true,
  },
  [SCENARIO_OVERDUE]: {
    position: 'left' as const,
    colorClass: 'border border-red-600/60 text-red-400 hover:border-red-500',
    label: 'Overdue',
    hidePercentage: false,
    shimmer: false,
  },
  [SCENARIO_COMPLETED]: {
    position: 'left' as const,
    colorClass: 'border border-gray-600/60 text-gray-400 hover:border-gray-500',
    label: 'Completed',
    hidePercentage: false,
    shimmer: false,
  },
  [SCENARIO_COUNTDOWN_TIMER]: {
    position: 'left' as const,
    colorClass: '', // Dynamic - set by colorClass memo
    label: 'Remaining',
    hidePercentage: false,
    shimmer: false,
  },
};

// Pre-defined color classes for progress ranges - reuse strings
const COLOR_GREEN = 'border border-green-600/60 text-green-400 hover:border-green-500';
const COLOR_AMBER = 'border border-amber-600/60 text-amber-400 hover:border-amber-500';
const COLOR_RED = 'border border-red-600/60 text-red-400 hover:border-red-500';

// @ts-ignore
const LiveTimer: Component<LiveTimerProps> = (props) => {
  const [local, others] = splitProps(props, [
    'startAt',
    'endAt', 
    'overdue',
    'icon',
    'class',
  ]);

  // Use fast tick for time display (1 second - lightweight)
  const fastTick = getFastTick();
  
  // Use slow tick for heavy calculations (10 seconds - performance)
  const slowTick = getSlowTick();
  
  // Pre-compute timestamps once - only recompute when props change
  const timestamps = createMemo(() => {
    const start = ensureDate(local.startAt);
    const end = ensureDate(local.endAt);
    
    if (!start) {
      throw new Error('startAt must be a valid Date object or date string');
    }
    
    // Store as seconds for faster math (avoid division on every update)
    return {
      startSec: Math.floor(start.getTime() / 1000),
      endSec: end ? Math.floor(end.getTime() / 1000) : null
    };
  });

  // Determine scenario type - uses slow tick (only needs to update every 10s)
  const scenario = createMemo(() => {
    const nowSec = Math.floor(slowTick() / 1000);
    const { startSec, endSec } = timestamps();

    if (nowSec <= startSec) return SCENARIO_COUNTDOWN_TO_START;
    if (endSec === null) return SCENARIO_OPEN_TIMER;
    
    const isCompleted = nowSec >= endSec;
    if (isCompleted && local.overdue) return SCENARIO_OVERDUE;
    if (isCompleted) return SCENARIO_COMPLETED;
    
    return SCENARIO_COUNTDOWN_TIMER;
  });

  // Compute progress - uses slow tick (heavy calculation, every 10s)
  const progress = createMemo(() => {
    const nowSec = Math.floor(slowTick() / 1000);
    const { startSec, endSec } = timestamps();
    const currentScenario = scenario();

    switch (currentScenario) {
      case SCENARIO_COUNTDOWN_TO_START: {
        const remainingSeconds = startSec - nowSec;
        return Math.min(100, (remainingSeconds / 3600) * 100);
      }
      
      case SCENARIO_OPEN_TIMER:
        return 95;
      
      case SCENARIO_OVERDUE: {
        const overdueSeconds = nowSec - endSec!;
        const totalDuration = endSec! - startSec;
        const overduePercent = totalDuration > 0 ? (overdueSeconds / totalDuration) * 100 : 0;
        return 100 + overduePercent;
      }
      
      case SCENARIO_COMPLETED:
        return 100;
      
      case SCENARIO_COUNTDOWN_TIMER: {
        const remainingSeconds = endSec! - nowSec;
        const totalDuration = endSec! - startSec;
        const elapsedSeconds = totalDuration - remainingSeconds;
        const progressPercent = totalDuration > 0 ? (elapsedSeconds / totalDuration) * 100 : 100;
        return Math.min(100, progressPercent);
      }
      
      default:
        return 0;
    }
  });

  // Compute statusLabel - uses fast tick (lightweight, every 1s for smooth display)
  const statusLabel = createMemo(() => {
    const nowSec = Math.floor(fastTick() / 1000);
    const { startSec, endSec } = timestamps();
    const currentScenario = scenario();

    switch (currentScenario) {
      case SCENARIO_COUNTDOWN_TO_START: {
        const remainingSeconds = startSec - nowSec;
        return formatTime(remainingSeconds);
      }
      
      case SCENARIO_OPEN_TIMER: {
        const elapsedSeconds = nowSec - startSec;
        return formatTime(elapsedSeconds);
      }
      
      case SCENARIO_OVERDUE: {
        const overdueSeconds = nowSec - endSec!;
        return formatTime(overdueSeconds);
      }
      
      case SCENARIO_COMPLETED: {
        const totalDuration = endSec! - startSec;
        return formatDuration(totalDuration);
      }
      
      case SCENARIO_COUNTDOWN_TIMER: {
        const remainingSeconds = endSec! - nowSec;
        return formatTime(remainingSeconds);
      }
      
      default:
        return '00:00:00';
    }
  });

  // Get static config for current scenario - reuses pre-defined objects
  const staticConfig = createMemo(() => {
    const currentScenario = scenario();
    return SCENARIO_CONFIGS[currentScenario] || SCENARIO_CONFIGS[SCENARIO_COUNTDOWN_TO_START];
  });

  // Get icon for current scenario - separate memo to avoid recreation
  const icon = createMemo(() => {
    if (local.icon) return local.icon;
    
    const currentScenario = scenario();
    switch (currentScenario) {
      case SCENARIO_COUNTDOWN_TO_START: return Calendar;
      case SCENARIO_OPEN_TIMER: return Play;
      case SCENARIO_OVERDUE: return AlertTriangle;
      case SCENARIO_COMPLETED: return Check;
      case SCENARIO_COUNTDOWN_TIMER: return Clock;
      default: return Clock;
    }
  });

  // Compute dynamic color only for countdown timer scenario
  const colorClass = createMemo(() => {
    const currentScenario = scenario();
    
    if (currentScenario === SCENARIO_COUNTDOWN_TIMER) {
      const progressValue = progress();
      // Use ternary for fast branching - reuse pre-defined strings
      return progressValue <= 25 ? COLOR_GREEN : progressValue <= 75 ? COLOR_AMBER : COLOR_RED;
    }
    
    return staticConfig().colorClass;
  });

  // Merge user classes with dynamic color classes
  const finalClass = createMemo(() => {
    const userClasses = local.class || '';
    
    // If user provided border and text colors, use their classes completely
    if (userClasses.includes('border-') && userClasses.includes('text-')) {
      return userClasses;
    }
    
    // Merge user classes with dynamic color theme
    return `${colorClass()} ${userClasses}`.trim();
  });

  return (
    <ProgressBar
      progress={progress()}
      icon={icon()}
      statusLabel={statusLabel()}
      label={staticConfig().label}
      position={staticConfig().position}
      hidePercentage={staticConfig().hidePercentage}
      shimmer={staticConfig().shimmer}
      class={finalClass()}
      {...others}
    />
  );
};

export default LiveTimer;
