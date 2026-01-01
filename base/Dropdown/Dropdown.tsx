import type { Component } from 'solid-js';
import { createSignal, onCleanup, onMount } from 'solid-js';
import ChevronDown from 'lucide-solid/icons/chevron-down';

export interface DropdownItemProps {
  id: string;
  label: string;
  description?: string;
  value?: any;
  icon?: any;
  badge?: string;
  disabled?: boolean;
  status?: 'open' | 'closed' | 'neutral';
}

export interface DropdownProps {
  items: DropdownItemProps[];
  value?: string;
  placeholder?: string;
  icon?: any;
  minWidth?: string;
  disabled?: boolean;
  onSelect?: (item: DropdownItemProps) => void;
  class?: string;
}

const Dropdown: Component<DropdownProps> = (props) => {
  const [isOpen, setIsOpen] = createSignal(false);
  const [selectedItem, setSelectedItem] = createSignal<DropdownItemProps | undefined>(
    props.items.find(item => item.id === props.value)
  );

  const currentSelection = () => selectedItem() || props.items[0];

  // Close dropdown when clicking outside
  onMount(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Element;
      if (!target.closest('[data-dropdown-container]')) {
        setIsOpen(false);
      }
    };
    document.addEventListener('click', handleClickOutside);

    onCleanup(() => {
      document.removeEventListener('click', handleClickOutside);
    });
  });

  const handleSelect = (item: DropdownItemProps) => {
    if (item.disabled) return;

    setSelectedItem(item);
    setIsOpen(false);
    props.onSelect?.(item);
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'open':
        return '#10B981';
      case 'closed':
        return '#6B7280';
      default:
        return '#6B7280';
    }
  };

  return (
    <div class={`relative inline-block ${props.class || ''}`} data-dropdown-container>
      <button
        onClick={() => !props.disabled && setIsOpen(!isOpen())}
        disabled={props.disabled}
        class={`flex items-center gap-3 px-4 py-3 bg-zinc-900/50 border border-zinc-800/50 rounded-lg hover:bg-zinc-900/70 transition-all backdrop-blur-sm select-none ${
          props.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
        }`}
        style={{ 'min-width': props.minWidth || '280px' }}
      >
        {props.icon && <props.icon size={18} class="text-amber-500" />}
        <div class="flex-1 text-left">
          <div class="font-semibold text-white">
            {currentSelection()?.label || props.placeholder || 'Select an option'}
          </div>
          {currentSelection()?.description && (
            <div class="text-xs text-zinc-400">{currentSelection()?.description}</div>
          )}
        </div>
        <ChevronDown
          size={18}
          class={`text-zinc-400 transition-transform ${isOpen() ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen() && (
        <div class="absolute top-full left-0 mt-2 w-full bg-zinc-900/95 border border-zinc-800/50 rounded-lg backdrop-blur-xl z-50 shadow-xl select-none">
          {props.items.map((item) => (
            <button
              onClick={() => handleSelect(item)}
              disabled={item.disabled}
              class={`w-full px-4 py-3 flex items-center gap-3 hover:bg-zinc-800/50 transition-all first:rounded-t-lg last:rounded-b-lg select-none ${
                currentSelection()?.id === item.id ? 'bg-zinc-800/30' : ''
              } ${item.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              {/* Status indicator or custom icon */}
              <div class="flex items-center gap-2 flex-shrink-0">
                {item.icon ? (
                  <item.icon size={16} class="text-amber-500" />
                ) : item.status ? (
                  <div
                    class="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: getStatusColor(item.status) }}
                  />
                ) : null}
              </div>

              <div class="flex-1 text-left min-w-0">
                <div class="font-medium text-white flex items-center gap-2">
                  {item.label}
                  {item.badge && (
                    <span class="px-2 py-0.5 text-xs font-medium bg-zinc-700/50 text-zinc-400 rounded flex-shrink-0">
                      {item.badge}
                    </span>
                  )}
                </div>
                {item.description && (
                  <div class="text-xs text-zinc-400 truncate">{item.description}</div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default Dropdown;