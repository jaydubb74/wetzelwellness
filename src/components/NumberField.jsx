import { useState, useEffect } from 'react';

/**
 * Number input that saves on blur/Enter rather than every keystroke, so a
 * field can be cleared and retyped (saving each keystroke snapped an empty
 * field back to a default, turning "10" into "810"). Out-of-range input
 * reverts; with `allowEmpty`, clearing the field saves null.
 */
export default function NumberField({ value, onCommit, min = 0, max, allowEmpty = false, ...props }) {
  const [text, setText] = useState(String(value ?? ''));
  useEffect(() => setText(String(value ?? '')), [value]);

  function commit() {
    if (allowEmpty && text.trim() === '') {
      if (value != null) onCommit(null);
      return;
    }
    const n = parseInt(text, 10);
    if (Number.isFinite(n) && n >= min && (max == null || n <= max)) {
      if (n !== value) onCommit(n);
      setText(String(n));
    } else {
      setText(String(value ?? ''));
    }
  }

  return (
    <input
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={text}
      onChange={e => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      {...props}
    />
  );
}
