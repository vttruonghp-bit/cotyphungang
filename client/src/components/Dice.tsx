import { useEffect, useState } from 'react';
import './dice.css';

const PIPS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [
    [28, 28],
    [72, 72],
  ],
  3: [
    [26, 26],
    [50, 50],
    [74, 74],
  ],
  4: [
    [28, 28],
    [72, 28],
    [28, 72],
    [72, 72],
  ],
  5: [
    [27, 27],
    [73, 27],
    [50, 50],
    [27, 73],
    [73, 73],
  ],
  6: [
    [28, 24],
    [72, 24],
    [28, 50],
    [72, 50],
    [28, 76],
    [72, 76],
  ],
};

interface DiceProps {
  values: readonly number[];
  /** Màu viền và chấm (màu người gieo). */
  color?: string;
  size?: number;
  /** Rung rồi dừng ở kết quả. */
  rolling?: boolean;
}

/** Xúc xắc vẽ bằng SVG; `rolling` cho hiệu ứng rung khi vừa gieo. */
export function Dice({ values, color = 'var(--teal)', size = 34, rolling = false }: DiceProps) {
  const [flicker, setFlicker] = useState<number[] | null>(null);
  useEffect(() => {
    if (!rolling || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let timer: ReturnType<typeof setTimeout>;
    const started = performance.now();
    const tick = () => {
      const elapsed = performance.now() - started;
      if (elapsed >= 2960) {
        setFlicker(null);
        return;
      }
      setFlicker(values.map(() => 1 + Math.floor(Math.random() * 6)));
      // Face changes are rapid at launch, then progressively slow down.
      const ratio = elapsed / 3000;
      timer = setTimeout(tick, Math.round(50 + 280 * ratio * ratio));
    };
    tick();
    return () => {
      clearTimeout(timer);
      setFlicker(null);
    };
  }, [rolling, values.length]);

  return (
    <span className="dice" role="img" aria-label={`Xúc xắc ${values.join(' và ')}`}>
      {values.map((v, i) => (
        <svg
          key={i}
          viewBox="0 0 100 100"
          width={size}
          height={size}
          className={rolling ? `die die-rolling die-rolling-${i % 2}` : 'die'}
          style={{ color }}
          aria-hidden="true"
        >
          <rect
            x="5"
            y="5"
            width="90"
            height="90"
            rx="18"
            fill="#fff"
            stroke="currentColor"
            strokeWidth="7"
          />
          {(PIPS[flicker?.[i] ?? v] ?? []).map(([cx, cy], k) => (
            <circle key={k} cx={cx} cy={cy} r="8.5" fill="currentColor" />
          ))}
        </svg>
      ))}
    </span>
  );
}
