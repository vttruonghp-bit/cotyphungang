import { Children, cloneElement, isValidElement, useId, type ReactNode } from 'react';
import { ICON_NAMES, colorOf } from '../theme';
import './token-icon.css';

/** Hình vẽ 24×24 cho 31 kí hiệu. Dùng `currentColor` để đổi màu theo người chơi. */
const GLYPHS: ReactNode[] = [
  // 0 Lá
  <>
    <path d="M4.5 19.5C4 11 9 4.5 20 4c.3 10.5-5.5 16-15.5 15.5z" fill="currentColor" />
    <path d="M6 18C9 14 12 11 16.5 8" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
  </>,
  // 1 Trăng
  <path d="M15.5 3.2A9 9 0 1 0 20.8 15 7.4 7.4 0 0 1 15.5 3.2z" fill="currentColor" />,
  // 2 Ô tô
  <>
    <path
      d="M3 16.5v-3.2c0-.8.4-1.4 1.1-1.7L6 7.6C6.4 6.6 7.2 6 8.2 6h7.6c1 0 1.8.6 2.2 1.6l1.9 4c.7.3 1.1.9 1.1 1.7v3.2z"
      fill="currentColor"
    />
    <path d="M7.6 8h8.8l1.3 3.4H6.3z" fill="#fff" />
    <circle cx="7.5" cy="17" r="2.2" fill="currentColor" stroke="#fff" strokeWidth="1.2" />
    <circle cx="16.5" cy="17" r="2.2" fill="currentColor" stroke="#fff" strokeWidth="1.2" />
  </>,
  // 3 Thuyền
  <>
    <path d="M11.2 3v11H4.5z" fill="currentColor" />
    <path d="M12.8 6.5l5.5 7.5h-5.5z" fill="currentColor" />
    <path d="M2.5 15.5h19l-3 4.5h-13z" fill="currentColor" />
  </>,
  // 4 Tàu hoả
  <>
    <rect x="5" y="3" width="14" height="14" rx="3" fill="currentColor" />
    <rect x="7.2" y="5.5" width="4" height="4.5" rx="1" fill="#fff" />
    <rect x="12.8" y="5.5" width="4" height="4.5" rx="1" fill="#fff" />
    <circle cx="8.5" cy="13.5" r="1.2" fill="#fff" />
    <circle cx="15.5" cy="13.5" r="1.2" fill="#fff" />
    <path
      d="M8 17l-2.5 4M16 17l2.5 4"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
  </>,
  // 5 Mây
  <path
    d="M7 19a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 17.8 8.6 5.2 5.2 0 0 1 17.5 19z"
    fill="currentColor"
  />,
  // 6 Gió
  <path
    d="M3 8.5h10.5a3 3 0 1 0-3-3M3 12.5h15a3 3 0 1 1-3 3M3 16.5h7"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    fill="none"
  />,
  // 7 Chiếc giày
  <>
    <path
      d="M3 16.5V8.8c0-.5.4-.8.9-.8H7l1.6 3 3.2 1.2 6.3 1.7c1.7.5 2.9 1.6 2.9 3.6z"
      fill="currentColor"
    />
    <path d="M3 17.5h18v2.2H3z" fill="currentColor" />
    <path d="M9.5 11.8l1.2-1.6M12 12.7l1.1-1.5" stroke="#fff" strokeWidth="1.3" />
  </>,
  // 8 Cái mũ
  <>
    <path d="M7.5 4.5h9l1 10h-11z" fill="currentColor" />
    <path d="M6.8 11.5h10.4v1.8H6.8z" fill="#fff" />
    <ellipse cx="12" cy="16.5" rx="9.5" ry="2.5" fill="currentColor" />
  </>,
  // 9 Bàn tay
  <path
    d="M7 12.5V6.2a1.4 1.4 0 0 1 2.8 0V11V4.4a1.4 1.4 0 0 1 2.8 0V11V5.4a1.4 1.4 0 0 1 2.8 0V11.5V8a1.4 1.4 0 0 1 2.8 0v7.2c0 3.6-2.6 6.3-6.2 6.3h-.6c-2 0-3.6-.9-4.6-2.6L4 14.6a1.4 1.4 0 0 1 2.3-1.6z"
    fill="currentColor"
  />,
  // 10 Thỏ
  <>
    <ellipse cx="9" cy="6.5" rx="2" ry="5" fill="currentColor" />
    <ellipse cx="15" cy="6.5" rx="2" ry="5" fill="currentColor" />
    <circle cx="12" cy="15" r="6.5" fill="currentColor" />
    <circle cx="9.6" cy="14.2" r="1.1" fill="#fff" />
    <circle cx="14.4" cy="14.2" r="1.1" fill="#fff" />
    <path d="M10.6 17.5h2.8" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" />
  </>,
  // 11 Táo cắn dở
  <>
    <path
      d="M12 7.5c-1.6-1-5.5-1.3-7 2.2-1.6 3.8.6 9.6 3.4 10.8 1.3.6 2.3-.3 3.6-.3s2.3.9 3.6.3c2.2-1 4-4.8 3.9-8a3.3 3.3 0 0 1-1.6-5.9c-1.7-.6-3.9-.2-5.9.9z"
      fill="currentColor"
    />
    <path d="M12 7.5c0-2 .9-3.6 2.6-4.5" stroke="currentColor" strokeWidth="1.6" fill="none" />
  </>,
  // 12 Ngôi nhà
  <>
    <path d="M2.5 11.5L12 3.5l9.5 8-1.4 1.5-1.6-1.3V20.5h-13V11.7L3.9 13z" fill="currentColor" />
    <rect x="10" y="14" width="4" height="6.5" rx=".6" fill="#fff" />
  </>,
  // 13 Nam sinh
  <>
    <circle cx="12" cy="7" r="4" fill="currentColor" />
    <path d="M4.5 21c0-4.4 3.3-7.5 7.5-7.5s7.5 3.1 7.5 7.5z" fill="currentColor" />
    <path d="M12 13.8l-1.4 2 1.4 4.2 1.4-4.2z" fill="#fff" />
  </>,
  // 14 Nữ sinh
  <>
    <path d="M6.5 11.5C6.2 6 8.5 3 12 3s5.8 3 5.5 8.5l-1.6.6H8.1z" fill="currentColor" />
    <circle cx="12" cy="8.2" r="3.2" fill="#fff" />
    <circle cx="12" cy="8.2" r="2.4" fill="currentColor" />
    <path d="M8.5 14h7l3 7h-13z" fill="currentColor" />
  </>,
  // 15 Chữ thập
  <path d="M9.5 3h5v6.5H21v5h-6.5V21h-5v-6.5H3v-5h6.5z" fill="currentColor" />,
  // 16 Chữ vạn (卍)
  <path
    d="M12 4v16M4 12h16M12 4H5.5M20 12V5.5M12 20h6.5M4 12v6.5"
    stroke="currentColor"
    strokeWidth="2.6"
    strokeLinecap="square"
    fill="none"
  />,
  // 17 Búa liềm
  <>
    <path
      d="M15.5 4.5a7.5 7.5 0 0 1-8.6 12.3"
      stroke="currentColor"
      strokeWidth="2.4"
      fill="none"
      strokeLinecap="round"
    />
    <path d="M6.9 16.8l-3.2 3" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    <path d="M8.5 9.5l9.5 10" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    <path d="M5.2 8.2l4.6-4.4 3 3.1-4.6 4.4z" fill="currentColor" />
  </>,
  // 18 Ngôi sao
  <path
    d="M12 2.5l2.9 6 6.6.8-4.9 4.5 1.3 6.6L12 17.1l-5.9 3.3 1.3-6.6-4.9-4.5 6.6-.8z"
    fill="currentColor"
  />,
  // 19 Tên lửa
  <>
    <path d="M12 2.5c3.6 2.7 5 7.4 4.1 12.5H7.9C7 9.9 8.4 5.2 12 2.5z" fill="currentColor" />
    <circle cx="12" cy="9" r="1.9" fill="#fff" />
    <path d="M7.9 11.5L5 15.5V18l3.3-1.6zM16.1 11.5l2.9 4V18l-3.3-1.6z" fill="currentColor" />
    <path d="M10 16.5h4l-2 4.5z" fill="#f2a23a" />
  </>,
  // 20 Con chó
  <>
    <path d="M6.4 4.6C4.2 4.8 2.6 7.8 3 11.4l3 1.3 1.6-6.6z" fill="currentColor" />
    <path d="M17.6 4.6c2.2.2 3.8 3.2 3.4 6.8l-3 1.3-1.6-6.6z" fill="currentColor" />
    <path
      d="M12 4.6c-3.7 0-6 2.7-6 6.6v3.2c0 3.7 2.7 6.1 6 6.1s6-2.4 6-6.1v-3.2c0-3.9-2.3-6.6-6-6.6z"
      fill="currentColor"
    />
    <circle cx="9.5" cy="10.8" r="1.15" fill="#fff" />
    <circle cx="14.5" cy="10.8" r="1.15" fill="#fff" />
    <ellipse cx="12" cy="14.9" rx="1.7" ry="1.15" fill="#fff" />
    <path
      d="M12 16v1.5M10.4 17.9c.9.7 2.3.7 3.2 0"
      stroke="#fff"
      strokeWidth="1.1"
      strokeLinecap="round"
      fill="none"
    />
  </>,
  // 21 Con bướm
  <>
    <path
      d="M11.3 11C9.6 6.4 6.6 3.7 4 4.1 2.1 4.5 2.3 8 3.9 10c1.4 1.7 4.4 2 7.4 1z"
      fill="currentColor"
    />
    <path
      d="M12.7 11c1.7-4.6 4.7-7.3 7.3-6.9 1.9.4 1.7 3.9.1 5.9-1.4 1.7-4.4 2-7.4 1z"
      fill="currentColor"
    />
    <path
      d="M11.3 12.6c-3 0-6 1.2-6.2 3.9-.2 2.3 2 3.4 3.8 2.4 1.6-.9 2.4-3.6 2.4-6.3z"
      fill="currentColor"
    />
    <path
      d="M12.7 12.6c3 0 6 1.2 6.2 3.9.2 2.3-2 3.4-3.8 2.4-1.6-.9-2.4-3.6-2.4-6.3z"
      fill="currentColor"
    />
    <rect
      x="11"
      y="6.8"
      width="2"
      height="12.4"
      rx="1"
      fill="currentColor"
      stroke="#fff"
      strokeWidth=".8"
    />
    <path
      d="M11.6 7.2L9.6 3.4M12.4 7.2l2-3.8"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      fill="none"
    />
  </>,
  // 22 Con chim
  <>
    <path
      d="M2.8 13.2c2.6-.2 4.3-1.6 5.1-3.8C8.9 6.8 11.1 5 14 5c2.6 0 4.4 1.6 4.9 3.6l2.8 1.1-2.8 1.1c-.3 4.6-3.8 8.2-9 8.2-2.9 0-5.6-1.6-7.1-5.8z"
      fill="currentColor"
    />
    <circle cx="15.6" cy="8.4" r="1.15" fill="#fff" />
    <path
      d="M7.6 12.6c2.3.2 4.8-.7 6.6-2.5-.2 3.4-2.7 5.7-6.2 5.9"
      stroke="#fff"
      strokeWidth="1.3"
      strokeLinecap="round"
      fill="none"
    />
    <path
      d="M10.4 19.2l-.8 2.4M13 19l.4 2.6"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
    />
  </>,
  // 23 Bông hoa
  <>
    <path d="M12 13.5V22" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M12 19.2c1.4-2.3 3.4-3 5.6-2.7-.6 2.1-2.6 3.4-5.6 2.7z" fill="currentColor" />
    <circle cx="12" cy="5.4" r="3.1" fill="currentColor" />
    <circle cx="15.9" cy="8.2" r="3.1" fill="currentColor" />
    <circle cx="14.4" cy="12.8" r="3.1" fill="currentColor" />
    <circle cx="9.6" cy="12.8" r="3.1" fill="currentColor" />
    <circle cx="8.1" cy="8.2" r="3.1" fill="currentColor" />
    <circle cx="12" cy="9.3" r="2.4" fill="#fff" />
    <circle cx="12" cy="9.3" r="1.2" fill="currentColor" />
  </>,
  // 24 Máy bay
  <path
    d="M12 1.8c.9 0 1.5 1 1.5 2.3v4.8l7.7 4.7v2.2l-7.7-2.4v4.6l2.3 1.7v1.5L12 20.2l-3.8 1v-1.5l2.3-1.7v-4.6l-7.7 2.4v-2.2l7.7-4.7V4.1c0-1.3.6-2.3 1.5-2.3z"
    fill="currentColor"
  />,
  // 25 Bác sĩ
  <>
    <circle cx="12" cy="7" r="4" fill="currentColor" />
    <circle cx="12" cy="4.6" r="1.6" fill="#fff" />
    <circle cx="12" cy="4.6" r=".75" fill="currentColor" />
    <path d="M4.5 21.2c0-4.4 3.3-7.6 7.5-7.6s7.5 3.2 7.5 7.6z" fill="currentColor" />
    <path d="M11 15.4h2v1.7h1.7v2H13v1.7h-2v-1.7H9.3v-2H11z" fill="#fff" />
  </>,
  // 26 Mũ cử nhân
  <>
    <path d="M6 11.4v4.4c0 1.8 2.7 3.2 6 3.2s6-1.4 6-3.2v-4.4l-6 3z" fill="currentColor" />
    <path d="M12 3.8L1.5 8.9 12 14l10.5-5.1z" fill="currentColor" stroke="#fff" strokeWidth=".9" />
    <path d="M20.3 9.6v6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    <path d="M19.2 16.2h2.2l.5 2.6h-3.2z" fill="currentColor" />
  </>,
  // 27 Cái ghế
  <>
    <rect x="6" y="2.5" width="12" height="9.2" rx="1.6" fill="currentColor" />
    <path d="M9.6 5v4.4M14.4 5v4.4" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" />
    <rect x="4.2" y="12.2" width="15.6" height="3.2" rx="1.1" fill="currentColor" />
    <path
      d="M6.4 15.2v6.3M17.6 15.2v6.3"
      stroke="currentColor"
      strokeWidth="2.3"
      strokeLinecap="round"
    />
  </>,
  // 28 Xe máy
  <>
    <circle cx="5.5" cy="16.8" r="3.3" fill="none" stroke="currentColor" strokeWidth="2.1" />
    <circle cx="18.5" cy="16.8" r="3.3" fill="none" stroke="currentColor" strokeWidth="2.1" />
    <path d="M7 13.2h4.6l2.6-3.6h3.3l1.5 4.4-1.6.7-1.2-2.4-3.4 4.6H8z" fill="currentColor" />
    <path d="M7.4 11.9c.4-1.1 1.4-1.7 2.7-1.7h3.2l-1.1 1.7z" fill="currentColor" />
    <path
      d="M15.6 9.6L14.5 6.3h2.6M17.3 9.7l1.2 7.1"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </>,
  // 29 Thanh gươm
  <>
    <path d="M21 3l-.7 3.8-9.6 9.6-3.1-3.1L17.2 3.7z" fill="currentColor" />
    <path d="M18.8 5.2l-9.2 9.2" stroke="#fff" strokeWidth=".9" strokeLinecap="round" />
    <path d="M5 13.1l5.9 5.9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    <path d="M7.6 16.4l-3.5 3.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    <circle cx="3.4" cy="20.6" r="1.7" fill="currentColor" />
  </>,
  // 30 Khẩu súng
  <>
    <path
      d="M3.4 5.8h17.2c.6 0 1 .4 1 1v3.6c0 .6-.4 1-1 1H3.4c-.6 0-1-.4-1-1V6.8c0-.6.4-1 1-1z"
      fill="currentColor"
    />
    <path d="M19.6 5.8V4.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    <path d="M4.2 8.6h13.4" stroke="#fff" strokeWidth="1" strokeLinecap="round" />
    <path d="M4.4 11.2h6l-2.1 9.6H2.2z" fill="currentColor" />
    <path
      d="M10.4 11.4v1.7c0 1.6 1.2 2.8 2.8 2.8h.7v-4.5"
      stroke="currentColor"
      strokeWidth="1.5"
      fill="none"
    />
    <path d="M11.9 11.6v2.3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
  </>,
];

interface TokenIconProps {
  icon: number;
  color: number;
  /** Đường kính: số px, hoặc độ dài CSS (vd. "var(--tk)") để co giãn theo bàn cờ. */
  size?: number | string;
  /** Nhấp nháy (người đang tới lượt). */
  blink?: boolean;
  /** Hiện tên kí hiệu khi đọc màn hình. */
  title?: string;
}

/** Thay mọi nét `currentColor` trong hình bằng `paint` (vd. `url(#id)` của một gradient). */
function paintGlyph(node: ReactNode, paint: string): ReactNode {
  return Children.map(node, (child) => {
    if (!isValidElement<{ fill?: string; stroke?: string; children?: ReactNode }>(child)) {
      return child;
    }
    const { fill, stroke, children } = child.props;
    return cloneElement(child, {
      ...(fill === 'currentColor' ? { fill: paint } : {}),
      ...(stroke === 'currentColor' ? { stroke: paint } : {}),
      ...(children ? { children: paintGlyph(children, paint) } : {}),
    });
  });
}

/**
 * Quân cờ: vòng tròn viền sáng theo màu người chơi, hình kí hiệu ở giữa. Màu chuyển sắc (Lục sắc,
 * Xanh vàng) tô cả viền lẫn hình bằng dải màu.
 */
export function TokenIcon({ icon, color, size = 28, blink = false, title }: TokenIconProps) {
  const c = colorOf(color);
  const gradientId = `tk-grad-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const multi = c.stops.length > 1;
  const glyph = typeof size === 'number' ? size * 0.62 : '62%';
  const shape = GLYPHS[icon] ?? GLYPHS[0];
  return (
    <span
      className={`token-icon${blink ? ' token-blink' : ''}${multi ? ' token-multi' : ''}`}
      style={{
        width: size,
        height: size,
        color: c.main,
        ['--glow' as string]: c.main,
        ['--paint' as string]: c.paint,
      }}
      role="img"
      aria-label={title ?? ICON_NAMES[icon] ?? 'Quân cờ'}
    >
      <svg viewBox="0 0 24 24" width={glyph} height={glyph} aria-hidden="true">
        {multi && (
          <defs>
            {/* Theo cả khung 24×24 (không theo từng nét) để nét thẳng đứng vẫn có màu. */}
            <linearGradient
              id={gradientId}
              gradientUnits="userSpaceOnUse"
              x1="2"
              y1="2"
              x2="22"
              y2="22"
            >
              {c.stops.map((stop, i) => (
                <stop key={stop} offset={i / (c.stops.length - 1)} stopColor={stop} />
              ))}
            </linearGradient>
          </defs>
        )}
        {multi ? paintGlyph(shape, `url(#${gradientId})`) : shape}
      </svg>
    </span>
  );
}
