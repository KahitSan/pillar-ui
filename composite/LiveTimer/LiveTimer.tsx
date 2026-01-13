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
    
    // Store as seconds for faster math (avoid division on every update)
    return {
      startSec: Math.floor(start.getTime() / 1000),
      endSec: end ? Math.floor(end.getTime() / 1000) : null
    };
  });

  // Determine scenario type - separate from computing values
  // This rarely changes so we cache it separately
  const scenario = createMemo(() => {
    const nowSec = Math.floor(currentTick() / 1000);
    const { startSec, endSec } = timestamps();

    if (nowSec <= startSec) return SCENARIO_COUNTDOWN_TO_START;
    if (endSec === null) return SCENARIO_OPEN_TIMER;
    
    const isCompleted = nowSec >= endSec;
    if (isCompleted && local.overdue) return SCENARIO_OVERDUE;
    if (isCompleted) return SCENARIO_COMPLETED;
    
    return SCENARIO_COUNTDOWN_TIMER;
  });

  // Compute only the dynamic values (progress and statusLabel)
  // This is the hot path - keep it minimal
  const dynamicValues = createMemo(() => {
    const nowSec = Math.floor(currentTick() / 1000);
    const { startSec, endSec } = timestamps();
    const currentScenario = scenario();

    switch (currentScenario) {
      case SCENARIO_COUNTDOWN_TO_START: {
        const remainingSeconds = startSec - nowSec;
        return {
          progress: Math.min(100, (remainingSeconds / 3600) * 100),
          statusLabel: formatTime(remainingSeconds)
        };
      }
      
      case SCENARIO_OPEN_TIMER: {
        const elapsedSeconds = nowSec - startSec;
        return {
          progress: 95,
          statusLabel: formatTime(elapsedSeconds)
        };
      }
      
      case SCENARIO_OVERDUE: {
        const overdueSeconds = nowSec - endSec!;
        const totalDuration = endSec! - startSec;
        const overduePercent = totalDuration > 0 ? (overdueSeconds / totalDuration) * 100 : 0;
        return {
          progress: 100 + overduePercent,
          statusLabel: formatTime(overdueSeconds)
        };
      }
      
      case SCENARIO_COMPLETED: {
        const totalDuration = endSec! - startSec;
        return {
          progress: 100,
          statusLabel: formatDuration(totalDuration)
        };
      }
      
      case SCENARIO_COUNTDOWN_TIMER: {
        const remainingSeconds = endSec! - nowSec;
        const totalDuration = endSec! - startSec;
        const elapsedSeconds = totalDuration - remainingSeconds;
        const progressPercent = totalDuration > 0 ? (elapsedSeconds / totalDuration) * 100 : 100;
        
        return {
          progress: Math.min(100, progressPercent),
          statusLabel: formatTime(remainingSeconds)
        };
      }
      
      default:
        return { progress: 0, statusLabel: '00:00:00' };
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
      const { progress } = dynamicValues();
      // Use ternary for fast branching - reuse pre-defined strings
      return progress <= 25 ? COLOR_GREEN : progress <= 75 ? COLOR_AMBER : COLOR_RED;
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

  // Access all values once to avoid multiple memo reads
  const config = staticConfig();
  const values = dynamicValues();
  
  return (
    <ProgressBar
      progress={values.progress}
      icon={icon()}
      statusLabel={values.statusLabel}
      label={config.label}
      position={config.position}
      hidePercentage={config.hidePercentage}
      shimmer={config.shimmer}
      class={finalClass()}
      {...others}
    />
  );
};

export default LiveTimer;
