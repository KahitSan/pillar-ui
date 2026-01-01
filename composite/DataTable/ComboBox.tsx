// ComboBox.tsx
import {
  createSignal,
  createEffect,
  onCleanup,
  onMount,
  JSX,
  splitProps,
  For,
  Show,
} from 'solid-js';
import X from 'lucide-solid/icons/x';

/* ----------------- types ----------------- */
type Option = { slug: string; name: string; color?: string };

type ComboBoxProps = {
  value?: string | string[] | null;
  options?: Option[] | (() => Option[]);
  multiple?: boolean;
  placeholder?: string;
  disabled?: boolean;
  variant?: 'default' | 'display';
  compact?: boolean;
  allowCustom?: boolean;
  className?: string;
  onChange?: (next: string | string[]) => void;
  onCustomCreate?: (name: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  ref?: (el: HTMLInputElement | undefined) => void;
};

/* ----------------- component ----------------- */
export default function ComboBox(props: ComboBoxProps): JSX.Element {
  /* ---------- props ---------- */
  const [p] = splitProps(props, [
    'value',
    'options',
    'multiple',
    'placeholder',
    'disabled',
    'variant',
    'compact',
    'allowCustom',
    'className',
    'onChange',
    'onCustomCreate',
    'onFocus',
    'onBlur',
    'ref',
  ]);

  /* ---------- state ---------- */
  const [isOpen, setIsOpen] = createSignal(false);
  const [inputValue, setInputValue] = createSignal('');
  const [focusedIdx, setFocusedIdx] = createSignal(0);
  const [internalOpts, setInternalOpts] = createSignal<Option[]>([]);

  /* 1. internal mirror when consumer does not provide value */
  const [innerValue, setInnerValue] = createSignal<string | string[] | null>(
    p.multiple ? [] : ''
  );

  /* ---------- refs ---------- */
  let containerRef: HTMLDivElement | undefined;
  let inputRef: HTMLInputElement | undefined;

  onMount(() => p.ref?.(inputRef));

  /* ---------- derived ---------- */
  const currentValue = () => (props.value !== undefined ? props.value : innerValue());

  const opts = (): Option[] => {
    const ext = typeof p.options === 'function' ? p.options() : p.options ?? [];
    const slugs = new Set(ext.map((o) => o.slug));
    return [...ext, ...internalOpts().filter((io) => !slugs.has(io.slug))];
  };

  const selectedSlugs = (): string[] => {
    const v = currentValue();
    return (p.multiple ? (Array.isArray(v) ? v : []) : v ? [v] : []) as string[];
  };

  const selectedSet = (): Set<string> => new Set(selectedSlugs());

  const filtered = (): Option[] =>
    opts().filter((o) => o.name.toLowerCase().includes(inputValue().toLowerCase()));

  const showCreate = (): boolean =>
    !!(p.allowCustom && inputValue().trim() && !opts().some((o) => o.name.toLowerCase() === inputValue().trim().toLowerCase()));

  const displayOptions = (): (Option & { isCreate?: boolean })[] => [
    ...(showCreate()
      ? [{ slug: '__create__', name: inputValue().trim(), color: '#6b7280', isCreate: true }]
      : []),
    ...filtered(),
  ];

  /* ---------- selection ---------- */
  const handleSelect = (o: Option & { isCreate?: boolean }) => {
    if (o.isCreate) {
      const newOpt = { slug: o.name, name: o.name, color: o.color };
      setInternalOpts((prev) => (prev.some((i) => i.slug === o.name) ? prev : [...prev, newOpt]));
      p.onCustomCreate?.(o.name);
      if (p.multiple) {
        const next = [...selectedSlugs(), o.name];
        p.onChange?.(next);
        if (props.value === undefined) setInnerValue(next);
        setInputValue('');
        setIsOpen(true);
        setTimeout(() => {
          inputRef?.focus();
          if (inputRef) inputRef.value = '';
        }, 0);
      } else {
        const next = o.name;
        p.onChange?.(next);
        if (props.value === undefined) setInnerValue(next);
        setInputValue(o.name);
        setIsOpen(false);
        if (inputRef) inputRef.value = '';
      }
      return;
    }

    if (p.multiple) {
      const s = selectedSet();
      if (s.has(o.slug)) s.delete(o.slug); else s.add(o.slug);
      const next = Array.from(s);
      p.onChange?.(next);
      if (props.value === undefined) setInnerValue(next);
      setInputValue('');
      setIsOpen(true);
      setTimeout(() => {
        inputRef?.focus();
        if (inputRef) inputRef.value = '';
      }, 0);
    } else {
      const next = o.slug;
      p.onChange?.(next);
      if (props.value === undefined) setInnerValue(next);
      setInputValue(opts().find((x) => x.slug === o.slug)?.name ?? o.slug);
      setIsOpen(false);
      if (inputRef) inputRef.value = '';
    }
  };

  /* ---------- keyboard ---------- */
  const onKeyDown = (e: KeyboardEvent) => {
    if (p.disabled) return;
    if (e.key === 'Escape') {
      setIsOpen(false);
      if (!p.multiple && currentValue()) {
        const sel = opts().find((o) => o.slug === currentValue());
        setInputValue(sel ? sel.name : (currentValue() as string));
      }

      if (inputRef) inputRef.value = '';
      
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const max = displayOptions().length - 1;
      setFocusedIdx((i) => (e.key === 'ArrowDown' ? (i >= max ? 0 : i + 1) : i <= 0 ? max : i - 1));
    }
    if (e.key === 'Enter') {
      const opt = displayOptions()[focusedIdx()];
      if (opt) handleSelect(opt);
    }
    if (e.key === 'Backspace' && inputValue() === '') {
      if (!p.multiple && selectedSlugs().length) {
        // Single-select: clear selection
        const next = '';
        p.onChange?.(next);
        if (props.value === undefined) setInnerValue(next);
      } else if (p.multiple && selectedSlugs().length) {
        // Multi-select: remove last item
        const current = selectedSlugs();
        const next = current.slice(0, -1); // remove last item
        p.onChange?.(next);
        if (props.value === undefined) setInnerValue(next);
      }
    }
  };

  const onFocus = () => {
    if (p.disabled) return;
    p.onFocus?.();
    setIsOpen(true);
    if (!p.multiple && currentValue()) setInputValue('');
  };

  /* ---------- sync input for single ---------- */
  createEffect(() => {
    if (!p.multiple && currentValue() && !isOpen()) {
      const v = currentValue() as string;
      const sel = opts().find((o) => o.slug === v);
      setInputValue(sel ? sel.name : v);
    }
  });

  /* ---------- click outside ---------- */
  createEffect(() => {
    if (!isOpen()) return;
    const handler = (e: MouseEvent) => {
      const portal = document.getElementById('cb-portal');
      if (
        !containerRef?.contains(e.target as Node) &&
        (!portal || !portal.contains(e.target as Node))
      ) {
        setIsOpen(false);
        if (!p.multiple && currentValue()) {
          const sel = opts().find((o) => o.slug === currentValue());
          setInputValue(sel ? sel.name : (currentValue() as string));
        }
        if (inputRef) inputRef.value = '';
        p.onBlur?.(); // Trigger the onBlur callback
      }
    };
    document.addEventListener('mousedown', handler);
    onCleanup(() => document.removeEventListener('mousedown', handler));
  });

  /* ---------- portal dropdown ---------- */
  createEffect(() => {
    const portal = document.getElementById('cb-portal');
    const scrollTop = portal?.querySelector('div')?.scrollTop ?? 0;
    if (portal) portal.remove();
    if (!isOpen() || !displayOptions().length) return;

    const rect = inputRef?.parentElement?.getBoundingClientRect();
    if (!rect) return;

    const div = document.createElement('div');
    div.id = 'cb-portal';
    div.className =
      'fixed z-[999999] overflow-hidden rounded-md border border-zinc-700 bg-zinc-900/95 backdrop-blur shadow-xl';
    Object.assign(div.style, {
      top: `${rect.bottom + 2}px`,
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      maxHeight: '256px',
    });

    const ul = document.createElement('div');
    ul.className = 'overflow-y-auto max-h-64';
    ul.style.cssText = 'max-height:16rem;overflow-y:auto;overflow-x:hidden;';

    displayOptions().forEach((o, i) => {
      const selected = selectedSet().has(o.slug);
      const row = document.createElement('div');
      row.className =
        'flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-amber-500/10 transition-colors';
      if (i === focusedIdx()) row.classList.add('bg-amber-500/20', 'text-amber-400');
      if (selected) row.classList.add('border-l-2', 'border-green-500');
      row.innerHTML = `
        ${!o.isCreate && o.color
          ? `<span class="w-4 h-4 rounded" style="background:${o.color}"></span>`
          : ''
        }
        <span class="flex-1 ${o.isCreate ? 'text-emerald-400' : 'text-white'}">${o.isCreate ? `Create "${o.name}"` : o.name
        }</span>
        ${selected ? '<span class="text-green-500">✓</span>' : ''}
      `;
      row.onclick = () => handleSelect(o);
      row.onmouseenter = () => setFocusedIdx(i);
      ul.appendChild(row);
    });
    div.appendChild(ul);
    document.body.appendChild(div);
    ul.scrollTop = scrollTop;
  });

  onCleanup(() => document.getElementById('cb-portal')?.remove());

  const isDisplay = () => p.variant === 'display';

  const badgeStyle = (o: Option) =>
    isDisplay()
      ? { background: 'transparent' }
      : { background: o.color || '#6b7280' };

  /* ---------- single JSX tree ---------- */
  return (
    <div class={`relative ${p.className || ''}`} ref={containerRef}>
      <div
        class={`flex flex-wrap items-center gap-1 w-full text-sm px-3 py-2 relative`}
        classList={{
          "border hover:border-zinc-500 transition-colors bg-zinc-800/50 rounded-md": !p.compact,
          "border-none": p.compact,
          "opacity-50 cursor-not-allowed": p.disabled
        }}
        onClick={() => !p.disabled && inputRef?.focus()}
        style={{ 'padding-right': selectedSlugs().length > 0 && !p.disabled ? '32px' : undefined }}
      >
        {/* 👇 WRAPPER: Limit content width to leave space for clear button */}
        <div class="flex flex-wrap items-center gap-1 w-full" style={{ width: 'calc(100% - 32px)' }}>
          <For each={selectedSlugs()}>
            {(sl, idx) => {
              const o = opts().find((x) => x.slug === sl) ?? { slug: sl, name: sl, color: '#6b7280' };
              return (
                <>
                  <Show when={isDisplay() && idx() > 0}>
                    <span class="text-zinc-400">,</span>
                  </Show>
                  <span
                    class="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded text-xs text-white"
                    style={badgeStyle(o)}
                  >
                    {o.name}
                    {!p.disabled && !isDisplay() && (
                      <button
                        onClick={() => handleSelect(o)}
                        class="text-white/70 hover:text-white"
                      >
                        <X size={10} />
                      </button>
                    )}
                  </span>
                </>
              );
            }}
          </For>

          <input
            ref={inputRef}
            type="text"
            onInput={(e) => {
              setInputValue(e.currentTarget.value);
              if (!isOpen()) setIsOpen(true);
            }}
            onFocus={onFocus}
            onKeyDown={onKeyDown}
            disabled={p.disabled}
            placeholder={
              selectedSlugs().length ? '' : p.placeholder || 'Type to search...'
            }
            class="bg-transparent outline-none flex-1 min-w-[120px] text-white placeholder-zinc-400"
          />
        </div>
        {/* 👆 END WRAPPER */}

        {/* 👇 ABSOLUTELY POSITIONED CLEAR BUTTON — PINNED TO RIGHT */}
        {selectedSlugs().length > 0 && !p.disabled && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              const next = p.multiple ? [] : '';
              p.onChange?.(next);
              if (props.value === undefined) setInnerValue(next);
              setIsOpen(false);
            }}
            class="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 flex-shrink-0 z-10"
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
}