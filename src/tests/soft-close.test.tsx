import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { DIALOG_CLOSE_MS, Dialog } from '../components/Dialog';

/** jsdom has no top layer: a small stand-in for showModal/close. */
function polyfillDialog() {
  const proto = HTMLDialogElement.prototype as HTMLDialogElement & { showModal?: () => void };
  proto.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  proto.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
}

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Öffnen
      </button>
      <Dialog open={open} title="Probe" onClose={() => setOpen(false)}>
        <p>Inhalt</p>
      </Dialog>
    </>
  );
}

describe('soft closing (1.12.2)', () => {
  beforeAll(polyfillDialog);
  afterEach(() => vi.useRealTimers());

  it('fades out with the content still visible, then closes and gives focus back', () => {
    vi.useFakeTimers();
    window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Öffnen' });
    opener.focus();
    fireEvent.click(opener);
    const dialog = document.querySelector('dialog')!;
    expect(dialog.open).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Schließen' }));
    expect(dialog.classList.contains('is-closing')).toBe(true);
    expect(screen.getByText('Inhalt')).toBeTruthy();
    act(() => void vi.advanceTimersByTime(DIALOG_CLOSE_MS * 4 + 20));
    expect(dialog.open).toBe(false);
    expect(dialog.classList.contains('is-closing')).toBe(false);
    expect(screen.queryByText('Inhalt')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('closes at once when reduced motion is asked for', () => {
    window.matchMedia = ((q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Öffnen' });
    opener.focus();
    fireEvent.click(opener);
    fireEvent.click(screen.getByRole('button', { name: 'Schließen' }));
    const dialog = document.querySelector('dialog')!;
    expect(dialog.open).toBe(false);
    expect(document.activeElement).toBe(opener);
  });
});
