import { createSignal, Show } from 'solid-js';

export interface MemberSearchResult {
  id?: string;
  name: string;
  email?: string;
  phone?: string;
}

export interface MemberSearchComboBoxProps {
  value: string | null;
  onChange: (member: MemberSearchResult | null, isNew: boolean) => void;
  placeholder?: string;
  class?: string;
}

/**
 * TEMPORARY STUB: Basic member search component
 * TODO: Replace with full implementation featuring:
 * - Real-time search/filtering
 * - Combobox dropdown with keyboard navigation
 * - Create new member option
 * - API integration for member lookup
 */
export function MemberSearchComboBox(props: MemberSearchComboBoxProps) {
  const [inputValue, setInputValue] = createSignal(props.value || '');

  const handleInput = (e: InputEvent) => {
    const target = e.currentTarget as HTMLInputElement;
    const value = target.value;
    setInputValue(value);
    
    // Temporarily treat any input as a new member
    if (value.trim()) {
      props.onChange({ name: value }, true);
    } else {
      props.onChange(null, false);
    }
  };

  return (
    <div class={props.class}>
      <input
        type="text"
        value={inputValue()}
        onInput={handleInput}
        placeholder={props.placeholder || 'Search member...'}
        class="w-full bg-zinc-900/50 border border-zinc-700/50 rounded px-3 py-2 text-white text-sm outline-none focus:border-amber-500/50 transition-colors"
      />
      <Show when={inputValue()}>
        <div class="mt-1 text-xs text-zinc-500">
          New member: {inputValue()}
        </div>
      </Show>
    </div>
  );
}
