import { useEffect, useMemo, useState } from 'react';
import { storageKey } from '../config';
import { cardPayload, normalizeAccount, payPayload, type CardData, type PayData, type QrKind } from '../edit/qr';
import { qrImage } from '../edit/qrImage';
import { useBackdropClose } from './backdrop';
import { strings } from './strings';

const KEY = storageKey('duckfix-qr');

/** What is remembered on this phone: the kind last used, the recipient and account, the business card. */
interface Remembered {
  kind: QrKind;
  pay: Pick<PayData, 'name' | 'account' | 'nip'>;
  card: CardData;
}
const EMPTY: Remembered = { kind: 'text', pay: { name: '', account: '', nip: '' }, card: { name: '', phone: '', email: '', org: '' } };

function load(): Remembered {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Remembered> | null;
    return {
      kind: v?.kind === 'pay' || v?.kind === 'card' ? v.kind : 'text',
      pay: { ...EMPTY.pay, ...v?.pay },
      card: { ...EMPTY.card, ...v?.card },
    };
  } catch {
    return EMPTY;
  }
}

function remember(r: Remembered): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(r));
  } catch {
    /* private mode */
  }
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  numeric,
  invalid,
}: {
  label: string;
  value: string;
  onChange(v: string): void;
  placeholder?: string;
  numeric?: boolean;
  invalid?: boolean;
}) {
  return (
    <label className="sheet-field">
      <span className="sheet-option-hint">{label}</span>
      <input
        type="text"
        className="sheet-input"
        aria-label={label}
        aria-invalid={invalid}
        value={value}
        placeholder={placeholder}
        inputMode={numeric ? 'decimal' : undefined}
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

/**
 * "Kod QR": a link or text, a bank transfer (read by Polish banking apps) or a business card, made
 * on the phone and put on the page like a stamp.
 */
export function QrSheet({ onInsert, onClose }: { onInsert(img: { src: string; aspect: number }): void; onClose(): void }) {
  const [saved] = useState(load);
  const [kind, setKind] = useState<QrKind>(saved.kind);
  const [text, setText] = useState('');
  const [pay, setPay] = useState<PayData>({ ...saved.pay, amount: '', title: '' });
  const [card, setCard] = useState<CardData>(saved.card);
  const backdrop = useBackdropClose(onClose);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const payload = kind === 'text' ? text.trim() || null : kind === 'pay' ? payPayload(pay) : cardPayload(card);
  const image = useMemo(() => {
    if (!payload) return null;
    try {
      return qrImage(payload);
    } catch {
      return null; // too long for a code
    }
  }, [payload]);

  // what is wrong in the transfer, said under its fields
  const accountBad = kind === 'pay' && pay.account.trim() !== '' && !normalizeAccount(pay.account);
  const amountBad =
    kind === 'pay' && pay.amount.trim() !== '' && payPayload({ ...pay, account: '0'.repeat(26), name: 'x', nip: '' }) === null;
  const nipBad = kind === 'pay' && pay.nip.trim() !== '' && !/^\d{10}$/.test(pay.nip.replace(/[\s-]/g, ''));

  const insert = () => {
    if (!image) return;
    remember({ kind, pay: { name: pay.name, account: pay.account, nip: pay.nip }, card });
    onInsert(image);
  };

  return (
    <div className="sheet-backdrop" {...backdrop}>
      <div className="sheet qr-sheet" role="dialog" aria-modal="true" aria-label={strings.qrTitle}>
        <div className="sheet-grabber" aria-hidden="true" />
        <h2 className="sheet-title">{strings.qrTitle}</h2>
        <div className="segmented" role="group" aria-label={strings.qrTitle}>
          {(
            [
              ['text', strings.qrKindText],
              ['pay', strings.qrKindPay],
              ['card', strings.qrKindCard],
            ] as const
          ).map(([k, label]) => (
            <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>
              {label}
            </button>
          ))}
        </div>
        {kind === 'text' && <Field label={strings.qrText} value={text} onChange={setText} placeholder={strings.qrTextPlaceholder} />}
        {kind === 'pay' && (
          <>
            <Field label={strings.qrPayName} value={pay.name} onChange={(name) => setPay({ ...pay, name })} />
            <Field
              label={strings.qrPayAccount}
              value={pay.account}
              onChange={(account) => setPay({ ...pay, account })}
              numeric
              invalid={accountBad}
            />
            {accountBad && <span className="sheet-error">{strings.qrBadAccount}</span>}
            <div className="qr-row">
              <Field
                label={strings.qrPayAmount}
                value={pay.amount}
                onChange={(amount) => setPay({ ...pay, amount })}
                numeric
                invalid={amountBad}
              />
              <Field label={strings.qrPayNip} value={pay.nip} onChange={(nip) => setPay({ ...pay, nip })} numeric invalid={nipBad} />
            </div>
            {amountBad && <span className="sheet-error">{strings.qrBadAmount}</span>}
            {nipBad && <span className="sheet-error">{strings.qrBadNip}</span>}
            <Field label={strings.qrPayTitle} value={pay.title} onChange={(title) => setPay({ ...pay, title })} />
            <p className="sheet-option-hint">{strings.qrPayHint}</p>
          </>
        )}
        {kind === 'card' && (
          <>
            <Field label={strings.qrCardName} value={card.name} onChange={(name) => setCard({ ...card, name })} />
            <div className="qr-row">
              <Field label={strings.qrCardPhone} value={card.phone} onChange={(phone) => setCard({ ...card, phone })} numeric />
              <Field label={strings.qrCardEmail} value={card.email} onChange={(email) => setCard({ ...card, email })} />
            </div>
            <Field label={strings.qrCardOrg} value={card.org} onChange={(org) => setCard({ ...card, org })} />
          </>
        )}
        <div className="qr-preview">
          {image ? <img src={image.src} alt={strings.qrPreview} /> : <p className="sheet-option-hint">{strings.qrFill}</p>}
        </div>
        <div className="sheet-actions">
          <button type="button" className="btn" onClick={onClose}>
            {strings.cancel}
          </button>
          <button type="button" className="btn btn-primary" disabled={!image} onClick={insert}>
            {strings.qrInsert}
          </button>
        </div>
      </div>
    </div>
  );
}
