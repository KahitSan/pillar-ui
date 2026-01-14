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

// Dynamic ticker for time display - switches between 1s and 5min based on time remaining
let dynamicTickSignal: (() => number) | null = null;
let dynamicIntervalId: number | undefined | any = null;
let dynamicSubscriberCount = 0;
let currentInterval = 1000;

function getDynamicTick(startSec: number, endSec: number | null, overdue: boolean): () => number {
  if (!dynamicTickSignal) {
    const [currentTick, setCurrentTick] = createSignal(Date.now());
    dynamicTickSignal = currentTick;
    
    const updateInterval = () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const HOURS_24 = 24 * 3600;
      let newInterval = 1000;
      
      // Check if time remaining is > 24 hours in any scenario
      if (nowSec <= startSec) {
        // Countdown to start
        const remainingSeconds = startSec - nowSec;
        newInterval = remainingSeconds > HOURS_24 ? 300000 : 1000; // 5 min or 1 sec
      } else if (endSec !== null && nowSec < endSec) {
        // Countdown timer
        const remainingSeconds = endSec - nowSec;
        newInterval = remainingSeconds > HOURS_24 ? 300000 : 1000;
      } else if (endSec !== null && nowSec >= endSec && overdue) {
        // Overdue
        const overdueSeconds = nowSec - endSec;
        newInterval = overdueSeconds > HOURS_24 ? 300000 : 1000;
      }
      
      // Only restart if interval changed
      if (newInterval !== currentInterval) {
        currentInterval = newInterval;
        if (dynamicIntervalId) clearInterval(dynamicIntervalId);
        dynamicIntervalId = setInterval(() => {
          setCurrentTick(Date.now());
          updateInterval();
        }, currentInterval);
      }
    };
    
    dynamicIntervalId = setInterval(() => {
      setCurrentTick(Date.now());
      updateInterval();
    }, currentInterval);
  }
  
  dynamicSubscriberCount++;
  
  onCleanup(() => {
    dynamicSubscriberCount--;
    if (dynamicSubscriberCount === 0 && dynamicIntervalId) {
      clearInterval(dynamicIntervalId);
      dynamicIntervalId = null;
      dynamicTickSignal = null;
      currentInterval = 1000;
    }
  });
  
  return dynamicTickSignal;
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

// Utility to format time with days support (no seconds/minutes when > 24h)
function formatTimeWithDays(totalSeconds: number): string {
  const HOURS_24 = 24 * 3600;
  
  if (totalSeconds > HOURS_24) {
    // Show days format: Xd Yh (no minutes or seconds)
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    
    return `${days}d ${hours}h`;
  }
  
  // Show HH:MM:SS for times under 24 hours
  return formatTime(totalSeconds);
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
    label: undefined, // Hide label for bookings
    hidePercentage: true, // Hide percentage for bookings
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

  // Use dynamic tick for time display (switches between 5min and 1s based on time remaining)
  const { startSec, endSec } = timestamps();
  const dynamicTick = getDynamicTick(startSec, endSec, local.overdue ?? false);
  
  // Use slow tick for heavy calculations (10 seconds - performance)
  const slowTick = getSlowTick();

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

  // Compute statusLabel - uses dynamic tick (switches between 5min and 1s based on time)
  const statusLabel = createMemo(() => {
    const nowSec = Math.floor(dynamicTick() / 1000);
    const { startSec, endSec } = timestamps();
    const currentScenario = scenario();

    switch (currentScenario) {
      case SCENARIO_COUNTDOWN_TO_START: {
        const remainingSeconds = startSec - nowSec;
        return formatTimeWithDays(remainingSeconds);
      }
      
      case SCENARIO_OPEN_TIMER: {
        const elapsedSeconds = nowSec - startSec;
        return formatTimeWithDays(elapsedSeconds);
      }
      
      case SCENARIO_OVERDUE: {
        const overdueSeconds = nowSec - endSec!;
        return formatTimeWithDays(overdueSeconds);
      }
      
      case SCENARIO_COMPLETED: {
        const totalDuration = endSec! - startSec;
        return formatDuration(totalDuration);
      }
      
      case SCENARIO_COUNTDOWN_TIMER: {
        const remainingSeconds = endSec! - nowSec;
        return formatTimeWithDays(remainingSeconds);
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
