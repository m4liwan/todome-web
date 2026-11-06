import { act, fireEvent, render, screen } from '@testing-library/react';
import { emptyState } from '../state/defaults';

const send = vi.fn();
vi.mock('../lib/desktop', () => ({
  desktop: {
    contactInfo: () => Promise.resolve({ mode: 'form', email: 'admin@konturia.de' }),
    contactSend: (...a: unknown[]) => send(...a),
  },
}));
vi.mock('../app/hooks', () => ({ useAppState: () => emptyState() }));
vi.mock('../app/services', () => ({ useServices: () => ({ deps: () => ({ newId: () => 'x' }) }) }));
const delivered = vi.fn();
vi.mock('../app/companion', () => ({ deliverCompanion: (...a: unknown[]) => delivered(...a) }));

const { ContactDialog } = await import('../components/dialogs/ContactDialog');

beforeAll(() => {
  const proto = HTMLDialogElement.prototype as HTMLDialogElement & { showModal?: () => void };
  proto.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  proto.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
});

async function openAndType() {
  render(<ContactDialog open onClose={() => undefined} />);
  await act(async () => undefined);
  fireEvent.change(screen.getByLabelText('Deine Nachricht'), { target: { value: 'Der Timer springt zurück.' } });
}

describe('contact form without a connection (1.12.2)', () => {
  it('lets the companion say calmly that there is no connection and keeps the draft', async () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await openAndType();
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Nachricht senden' })));
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Spike:');
    expect(alert.textContent).toContain('keine Internetverbindung');
    expect(send).not.toHaveBeenCalled();
    expect((screen.getByLabelText('Deine Nachricht') as HTMLTextAreaElement).value).toBe('Der Timer springt zurück.');
    online.mockRestore();
  });

  it('turns a failed send into a calm hint with the address to write to', async () => {
    send.mockResolvedValueOnce({ ok: false, reason: 'server' });
    await openAndType();
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Nachricht senden' })));
    expect(screen.getByRole('alert').textContent).toContain('admin@konturia.de');
    expect(delivered).not.toHaveBeenCalled();
  });
});
