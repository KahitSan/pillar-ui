import { splitProps, createSignal, onMount, onCleanup, createMemo } from 'solid-js';
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

// Utility to format time as HH:MM:SS
function formatTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
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

// Utility to get time difference in seconds
function getTimeDifference(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 1000));
}

// Utility to get elapsed time in seconds
function getElapsedTime(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 1000));
}

// @ts-ignore
const LiveTimer: Component<LiveTimerProps> = (props) => {
  const [local, others] = splitProps(props, [
    'startAt',
    'endAt', 
    'overdue',
    'icon',
    'class'
  ]);

  const [currentTime, setCurrentTime] = createSignal(new Date());
  let intervalId: number | undefined | any;

  // Update current time every second
  onMount(() => {
    intervalId = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
  });

  onCleanup(() => {
    if (intervalId) clearInterval(intervalId);
  });

  // Determine current scenario and calculate values
  const timerState = createMemo(() => {
    const now = currentTime();
    
    // Safely convert props to Date objects
    const start = ensureDate(local.startAt);
    const end = ensureDate(local.endAt);

    // Ensure start is a valid Date
    if (!start) {
      throw new Error('startAt must be a valid Date object or date string');
    }

    // Scenario: Current time <= StartAt (countdown to start)
    if (now <= start) {
      const remainingSeconds = getTimeDifference(now, start);
      return {
        scenario: 'countdown-to-start' as const,
        statusLabel: formatTime(remainingSeconds), // HH:MM:SS always in statusLabel
        progress: Math.min(100, (remainingSeconds / 3600) * 100), // Cap at 100%
        position: 'right' as const, // Fixed: position right for countdown
        colorClass: 'border border-blue-600/60 text-blue-400 hover:border-blue-500',
        label: 'before start',
        hidePercentage: false,
        shimmer: false,
        icon: local.icon || Calendar
      };
    }

    // Scenario: Current time >= StartAt AND EndAt is NOT set (open timer)
    if (!end) {
      const elapsedSeconds = getElapsedTime(start, now);
      return {
        scenario: 'open-timer' as const,
        statusLabel: formatTime(elapsedSeconds), // HH:MM:SS in statusLabel
        progress: 95,
        position: 'left' as const,
        colorClass: 'border border-green-600/60 text-green-400 hover:border-green-500',
        label: 'Open time',
        hidePercentage: true,
        shimmer: true,
        icon: local.icon || Play
      };
    }

    // Calculate timing info for scenarios with endAt (end is guaranteed to be a Date here)
    const totalDuration = getTimeDifference(start, end);
    const isCompleted = now >= end;
    
    // Scenario: Overdue (past endAt with overdue enabled)
    if (isCompleted && local.overdue) {
      const overdueSeconds = getElapsedTime(end, now);
      const overduePercent = totalDuration > 0 ? (overdueSeconds / totalDuration) * 100 : 0;
      
      return {
        scenario: 'overdue' as const,
        statusLabel: formatTime(overdueSeconds), // HH:MM:SS of overdue time
        progress: 100 + overduePercent, // 100+ for overflow
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
        scenario: 'completed' as const,
        statusLabel: formatDuration(totalDuration), // Duration consumed, not HH:MM:SS
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
    const remainingSeconds = getTimeDifference(now, end);
    const elapsedSeconds = totalDuration - remainingSeconds;
    const progressPercent = totalDuration > 0 ? (elapsedSeconds / totalDuration) * 100 : 100;

    // Dynamic color based on progress
    let colorClass: string;
    if (progressPercent <= 25) {
      // Just started - Green
      colorClass = 'border border-green-600/60 text-green-400 hover:border-green-500';
    } else if (progressPercent <= 75) {
      // In progress - Amber
      colorClass = 'border border-amber-600/60 text-amber-400 hover:border-amber-500';
    } else {
      // Almost finished - Red
      colorClass = 'border border-red-600/60 text-red-400 hover:border-red-500';
    }

    return {
      scenario: 'countdown-timer' as const,
      statusLabel: formatTime(remainingSeconds), // HH:MM:SS in statusLabel
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