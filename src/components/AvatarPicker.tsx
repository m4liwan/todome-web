import { isProAvatar, openPro } from '../app/pro';
import { AVATARS } from '../domain/companion';
import type { AvatarId } from '../domain/types';
import { Avatar } from './Avatar';
import { IconLock } from './icons';

export function AvatarPicker({ value, onChange }: { value: AvatarId; onChange: (id: AvatarId) => void }) {
  return (
    <div className="avatar-picker" role="radiogroup" aria-label="Begleiter wählen">
      {AVATARS.map((a) => {
        const locked = isProAvatar(a.id);
        return (
          <label key={a.id} className={`avatar-option${value === a.id ? ' is-on' : ''}${locked ? ' is-pro' : ''}`}>
            <input
              type="radio"
              name="avatar"
              value={a.id}
              checked={value === a.id}
              aria-disabled={locked || undefined}
              onChange={() => (locked ? openPro('avatars') : onChange(a.id))}
              onClick={(e) => {
                // A locked companion only opens the preview, it never gets picked.
                if (!locked) return;
                e.preventDefault();
                openPro('avatars');
              }}
            />
            <span className="avatar-option__figure">
              <Avatar id={a.id} mood={value === a.id ? 'happy' : 'calm'} size={72} />
              {locked && (
                <span className="pro-blur__lock" aria-hidden="true">
                  <IconLock size={14} />
                </span>
              )}
            </span>
            <strong>{a.name}</strong>
            <span>{a.description}</span>
            {locked && (
              <span className="pro-lock" title="Bald in Pro">
                <IconLock size={12} />
                Pro
              </span>
            )}
          </label>
        );
      })}
    </div>
  );
}
