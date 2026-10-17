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

function Face({ value, color }: { value: number; color: string }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <rect
        x="2"
        y="2"
        width="96"
        height="96"
        rx="16"
        fill="#fdfdfb"
        stroke="#d9d4c7"
        strokeWidth="3"
      />
      {(PIPS[value] ?? []).map(([cx, cy], k) => (
        <circle key={k} cx={cx} cy={cy} r="9" fill={value === 1 ? '#c8202a' : color} />
      ))}
    </svg>
  );
}

/** Mặt nằm ở mỗi phía của khối (hai mặt đối nhau cộng lại bằng 7). */
const SIDES = [
  ['front', 1],
  ['back', 6],
  ['right', 3],
  ['left', 4],
  ['top', 2],
  ['bottom', 5],
] as const;

/** Góc xoay để đưa mặt `v` ra phía trước. */
const TO_FRONT: Record<number, [number, number]> = {
  1: [0, 0],
  6: [0, 180],
  3: [0, -90],
  4: [0, 90],
  2: [-90, 0],
  5: [90, 0],
};

/** Một viên xúc xắc 3D nhìn xéo từ trên xuống: thấy 3 mặt, mặt kết quả to nhất ở phía trước. */
function Die3D({
  value,
  color,
  size,
  rolling,
  index,
}: {
  value: number;
  color: string;
  size: number;
  rolling: boolean;
  index: number;
}) {
  const [x, y] = TO_FRONT[value] ?? [0, 0];
  // Khi gieo: quay thêm vài vòng (mỗi viên một hướng) rồi dừng đúng mặt kết quả.
  const spin = rolling ? (index % 2 === 0 ? [1440, 1080] : [-1080, 1440]) : [0, 0];
  const [settled, setSettled] = useState(!rolling);
  useEffect(() => {
    if (!rolling) return;
    setSettled(false);
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setSettled(true)));
    return () => cancelAnimationFrame(id);
  }, [rolling]);
  const rx = settled ? x : x + spin[0]!;
  const ry = settled ? y : y + spin[1]!;
  return (
    <span
      className={rolling ? `die3d-wrap die3d-bounce die3d-bounce-${index % 2}` : 'die3d-wrap'}
      style={{ width: size, height: size, ['--s' as string]: `${size}px` }}
    >
      <span
        className={settled && rolling ? 'die3d is-rolling' : 'die3d'}
        style={{ transform: `rotateX(-24deg) rotateY(-32deg) rotateX(${rx}deg) rotateY(${ry}deg)` }}
      >
        {SIDES.map(([side, v]) => (
          <span key={side} className={`die3d-face die3d-${side}`}>
            <Face value={v} color={color} />
          </span>
        ))}
      </span>
    </span>
  );
}

/**
 * Xúc xắc: từ cỡ 28px trở lên vẽ khối 3D (thấy 3 mặt, lăn như thật khi `rolling`);
 * nhỏ hơn (trong danh sách) vẽ phẳng bằng SVG.
 */
export function Dice({ values, color = 'var(--teal)', size = 34, rolling = false }: DiceProps) {
  if (size >= 28) {
    return (
      <span className="dice dice-3d" role="img" aria-label={`Xúc xắc ${values.join(' và ')}`}>
        {values.map((v, i) => (
          <Die3D key={i} value={v} color={color} size={size} rolling={rolling} index={i} />
        ))}
      </span>
    );
  }
  return <FlatDice values={values} color={color} size={size} rolling={rolling} />;
}

function FlatDice({ values, color, size, rolling }: Required<DiceProps>) {
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
