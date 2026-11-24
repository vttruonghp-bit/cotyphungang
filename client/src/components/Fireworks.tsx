import type { CSSProperties } from 'react';
import './fireworks.css';

/** Thời gian một lần bắn pháo hoa (ms); màn chơi gỡ hiệu ứng sau chừng này. */
export const FIREWORKS_MS = 2000;

/** Vị trí (% màn hình), màu và lúc bắn của từng quả. */
const BURSTS = [
  { x: 28, y: 34, color: '#ffd54f', delay: 0 },
  { x: 70, y: 26, color: '#ff6f91', delay: 150 },
  { x: 50, y: 52, color: '#4fc3f7', delay: 300 },
  { x: 84, y: 58, color: '#b9f6ca', delay: 450 },
  { x: 16, y: 62, color: '#e1bee7', delay: 600 },
] as const;
const SPARKS = 16;

/** Pháo hoa thoáng qua phủ lên màn chơi (không chặn bấm). */
export function Fireworks() {
  return (
    <div className="fireworks" aria-hidden="true">
      {BURSTS.map((b) => (
        <div
          key={`${b.x}-${b.y}`}
          className="fw-burst"
          style={
            {
              left: `${b.x}%`,
              top: `${b.y}%`,
              '--fw-color': b.color,
              '--fw-delay': `${b.delay}ms`,
            } as CSSProperties
          }
        >
          <span className="fw-rocket" />
          {Array.from({ length: SPARKS }, (_, k) => (
            <span
              key={k}
              className="fw-spark"
              style={{ '--fw-angle': `${(360 / SPARKS) * k}deg` } as CSSProperties}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
