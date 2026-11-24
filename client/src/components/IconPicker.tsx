import { ICON_NAMES, PLAYER_COLORS, colorOf } from '../theme';
import { TokenIcon } from './TokenIcon';
import './icon-picker.css';

export interface Appearance {
  color: number;
  icon: number;
}

interface IconPickerProps extends Appearance {
  /** Màu người khác đang dùng (bị khóa). */
  takenColors: readonly number[];
  /** Kí hiệu người khác đang dùng (bị khóa). */
  takenIcons: readonly number[];
  onChange: (next: Appearance) => void;
}

/** Nền nút theo màu người chơi, sẫm hơn chút để chữ trắng dễ đọc (nhất là màu vàng). */
export const buttonColor = (color: number) =>
  `color-mix(in srgb, ${colorOf(color).main} 72%, var(--navy))`;

/** Bảng Đen vl (luật §12): 10 màu (8 trơn, 2 chuyển sắc), bên dưới 31 kí hiệu vẽ theo màu đang chọn. */
export function IconPicker({ color, icon, takenColors, takenIcons, onChange }: IconPickerProps) {
  const c = colorOf(color);
  return (
    <div
      className="icon-picker"
      style={{ ['--pick' as string]: c.main, ['--pick-soft' as string]: c.soft }}
    >
      <p className="eyebrow">Chọn màu · {c.name}</p>
      <div className="icon-picker-colors" role="radiogroup" aria-label="Màu">
        {PLAYER_COLORS.map((pc, i) => {
          const taken = takenColors.includes(i);
          return (
            <button
              key={pc.name}
              type="button"
              role="radio"
              aria-checked={i === color}
              aria-label={taken ? `${pc.name} (đã có người dùng)` : pc.name}
              className={`icon-picker-color${i === color ? ' is-on' : ''}${taken ? ' is-taken' : ''}`}
              disabled={taken}
              onClick={() => onChange({ color: i, icon })}
            >
              <span style={{ background: pc.paint }} />
            </button>
          );
        })}
      </div>

      <p className="eyebrow">Chọn hình · {ICON_NAMES[icon]}</p>
      <div className="icon-picker-icons" role="radiogroup" aria-label="Kí hiệu">
        {ICON_NAMES.map((name, i) => {
          const taken = takenIcons.includes(i);
          return (
            <button
              key={name}
              type="button"
              role="radio"
              aria-checked={i === icon}
              aria-label={taken ? `${name} (đã có người dùng)` : name}
              className={`icon-picker-icon${i === icon ? ' is-on' : ''}${taken ? ' is-taken' : ''}`}
              disabled={taken}
              onClick={() => onChange({ color, icon: i })}
            >
              <TokenIcon icon={i} color={color} size={34} />
              <span className="icon-picker-name">{name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
