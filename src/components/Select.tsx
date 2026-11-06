import { usePresence } from '../lib/presence';
import {
  Children,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from 'react';

interface Props {
  value: string | number;
  onChange: (value: string) => void;
  /** Native-style `<option value>` children, so call sites read like a select. */
  children: ReactNode;
  disabled?: boolean;
  'aria-label'?: string;
  className?: string;
}

interface Opt {
  value: string;
  label: ReactNode;
  text: string;
  disabled: boolean;
}

function readOptions(children: ReactNode): Opt[] {
  const out: Opt[] = [];
  Children.toArray(children).forEach((child) => {
    if (!isValidElement(child)) return;
    const el = child as ReactElement<{ value?: string | number; children?: ReactNode; disabled?: boolean }>;
    const label = el.props.children;
    out.push({
      value: String(el.props.value ?? ''),
      label,
      text: typeof label === 'string' || typeof label === 'number' ? String(label) : '',
      disabled: Boolean(el.props.disabled),
    });
  });
  return out;
}

type PopoverEl = HTMLUListElement & { showPopover?: () => void; hidePopover?: () => void };

/**
 * Glass dropdown that replaces the native <select> (whose popup Windows
 * paints in system blue). Listbox pattern: arrows, Home/End, type-ahead,
 * Enter/Space to pick, Esc to close. The list opens in the top layer
 * (Popover API), so it is never clipped by dialogs or scroll containers.
 */
export function Select({ value, onChange, children, disabled, className = '', ...aria }: Props) {
  const options = useMemo(() => readOptions(children), [children]);
  const current = String(value);
  const selectedIndex = Math.max(0, options.findIndex((o) => o.value === current));
  const [open, setOpen] = useState(false);
  const presence = usePresence(open);
  const [active, setActive] = useState(selectedIndex);
  const [placement, setPlacement] = useState<'down' | 'up'>('down');
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<PopoverEl>(null);
  const typed = useRef({ text: '', at: 0 });
  const listId = useId();

  const position = useCallback(() => {
    const b = button.current;
    const l = list.current;
    if (!b || !l) return;
    const r = b.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const wanted = Math.min(320, l.scrollHeight + 2);
    const up = spaceBelow < wanted + 16 && r.top > spaceBelow;
    setPlacement(up ? 'up' : 'down');
    l.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - r.width - 8))}px`;
    l.style.width = `${r.width}px`;
    l.style.maxHeight = `${Math.max(140, Math.min(320, (up ? r.top : spaceBelow) - 16))}px`;
    if (up) {
      l.style.top = 'auto';
      l.style.bottom = `${window.innerHeight - r.top + 6}px`;
    } else {
      l.style.bottom = 'auto';
      l.style.top = `${r.bottom + 6}px`;
    }
  }, []);

  useEffect(() => {
    const l = list.current;
    if (l && !l.hasAttribute('popover')) l.setAttribute('popover', 'manual');
  }, []);

  useLayoutEffect(() => {
    const l = list.current;
    if (!l) return;
    if (open) {
      try {
        l.showPopover?.();
      } catch {
        /* already open */
      }
      position();
      l.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' });
    } else {
      try {
        l.hidePopover?.();
      } catch {
        /* already hidden */
      }
    }
  }, [open, position]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!button.current?.contains(t) && !list.current?.contains(t)) setOpen(false);
    };
    const onMove = () => position();
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
  }, [open, position]);

  useEffect(() => {
    if (!open) return;
    list.current?.querySelectorAll<HTMLElement>('[role="option"]')[active]?.scrollIntoView?.({ block: 'nearest' });
  }, [active, open]);

  const choose = (i: number) => {
    const o = options[i];
    if (!o || o.disabled) return;
    if (o.value !== current) onChange(o.value);
    setOpen(false);
    button.current?.focus();
  };

  const step = (from: number, dir: 1 | -1) => {
    for (let i = from + dir; i >= 0 && i < options.length; i += dir) if (!options[i]?.disabled) return i;
    return from;
  };

  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    const k = e.key;
    if (k === 'ArrowDown' || k === 'ArrowUp') {
      e.preventDefault();
      if (!open) {
        setActive(selectedIndex);
        setOpen(true);
        return;
      }
      setActive((a) => step(a, k === 'ArrowDown' ? 1 : -1));
    } else if (k === 'Home' || k === 'End') {
      if (!open) return;
      e.preventDefault();
      setActive(k === 'Home' ? step(-1, 1) : step(options.length, -1));
    } else if (k === 'Enter' || k === ' ') {
      e.preventDefault();
      if (open) choose(active);
      else {
        setActive(selectedIndex);
        setOpen(true);
      }
    } else if (k === 'Escape') {
      if (open) {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
      }
    } else if (k === 'Tab') {
      setOpen(false);
    } else if (k.length === 1 && /\S/.test(k)) {
      const now = Date.now();
      typed.current = { text: now - typed.current.at < 700 ? typed.current.text + k.toLowerCase() : k.toLowerCase(), at: now };
      const hit = options.findIndex((o) => !o.disabled && o.text.toLowerCase().startsWith(typed.current.text));
      if (hit >= 0) {
        if (open) setActive(hit);
        else choose(hit);
      }
    }
  };

  const selected = options[selectedIndex];
  return (
    <>
      <button
        ref={button}
        type="button"
        className={`select${open ? ' is-open' : ''} ${className}`}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        aria-label={aria['aria-label']}
        disabled={disabled}
        onClick={() => {
          setActive(selectedIndex);
          setOpen((o) => !o);
        }}
        onKeyDown={onKey}
      >
        <span className="select__value">{selected?.label ?? ''}</span>
        <svg className="select__chevron" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <ul
        ref={list}
        id={listId}
        role="listbox"
        className={`select__list select__list--${placement}${open ? ' is-open' : ''}${presence.closing ? ' is-closing' : ''}`}
        hidden={!presence.mounted}
        aria-hidden={presence.closing || undefined}
      >
        {options.map((o, i) => (
          <li
            key={o.value}
            id={`${listId}-${i}`}
            role="option"
            aria-selected={o.value === current}
            aria-disabled={o.disabled || undefined}
            className={`select__option${i === active ? ' is-active' : ''}`}
            onPointerEnter={() => setActive(i)}
            onPointerDown={(e) => e.preventDefault()}
            onClick={(e) => {
              // The list lives inside a <label>; keep it from re-clicking the button.
              e.preventDefault();
              choose(i);
            }}
          >
            <span>{o.label}</span>
            {o.value === current && (
              <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
