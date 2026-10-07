import { BOARD, nearestAhead } from '../board';
import { CHANCE_CARDS, COMMUNITY_CARDS, FORTUNE_MIRROR_AMOUNT } from '../cards';
import {
  BOARD_SIZE,
  JAIL_BAIL,
  MAX_JAIL_TURNS,
  MAX_DOUBLES_BEFORE_JAIL,
  MAX_PLAYERS,
  METRO_FEE_PERCENT,
  METRO_INDEX,
  MIN_PLAYERS,
  PLAYER_COLOR_COUNT,
  PLAYER_ICON_COUNT,
  START_MONEY,
} from '../constants';
import { downgradeRefund, mortgageValue, redeemCost, sellValue } from '../finance';
import {
  RuleError,
  addLog,
  currentPlayer,
  expireTaxWaivers,
  getPlayer,
  hasCard,
  jumpTo,
  maxLiquidationValue,
  moveForward,
  ownableTile,
  ownedTiles,
  propertyTile,
  sendToJail,
  takeCard,
  tileState,
} from './core';
import { land } from './landing';
import { rollDie, shuffle, type Rng } from './rng';
import type {
  Action,
  ActionResult,
  GameState,
  ManageOp,
  NewPlayer,
  Pending,
  PlayerState,
  Step,
} from './types';

// ---------------------------------------------------------------------------
// Tạo ván
// ---------------------------------------------------------------------------

export function createGame(newPlayers: NewPlayer[], rng: Rng): GameState {
  if (newPlayers.length < MIN_PLAYERS || newPlayers.length > MAX_PLAYERS) {
    throw new RuleError(`Cần ${MIN_PLAYERS}–${MAX_PLAYERS} người chơi`);
  }
  const unique = (xs: unknown[]) => new Set(xs).size === xs.length;
  if (!unique(newPlayers.map((p) => p.id))) throw new RuleError('Trùng mã người chơi');
  if (!unique(newPlayers.map((p) => p.color))) throw new RuleError('Trùng màu');
  if (!unique(newPlayers.map((p) => p.icon))) throw new RuleError('Trùng biểu tượng');
  for (const p of newPlayers) checkAppearance(p.color, p.icon);

  const s: GameState = {
    players: newPlayers.map((p) => ({
      ...p,
      cash: START_MONEY,
      position: 0,
      inJail: false,
      jailAttempts: 0,
      heldCards: [],
      status: 'active',
    })),
    current: 0,
    turnNumber: 1,
    rolled: false,
    doublesCount: 0,
    extraRoll: false,
    lastDice: null,
    arrivedByRoll: false,
    tiles: BOARD.map((t) =>
      t.kind === 'property' || t.kind === 'station' || t.kind === 'utility'
        ? { owner: null, level: 0, mortgaged: false, boughtTurn: null }
        : null,
    ),
    decks: {
      chance: shuffle(
        CHANCE_CARDS.map((c) => c.id),
        rng,
      ),
      community: shuffle(
        COMMUNITY_CARDS.map((c) => c.id),
        rng,
      ),
    },
    pending: { type: 'roll', playerId: newPlayers[0]!.id },
    queue: [],
    log: [],
    events: [],
    loserId: null,
  };

  // Mỗi người đổ 2 viên, cao nhất đi trước; bằng nhau thì những người bằng nhau đổ lại.
  let candidates = s.players.map((_, i) => i);
  while (candidates.length > 1) {
    const rolls = candidates.map((i) => {
      const total = rollDie(rng) + rollDie(rng);
      addLog(s, s.players[i]!.id, `Đổ chọn lượt: ${total}`);
      return total;
    });
    const best = Math.max(...rolls);
    candidates = candidates.filter((_, k) => rolls[k] === best);
  }
  s.current = candidates[0]!;
  startTurn(s);
  return s;
}

function checkAppearance(color: number, icon: number) {
  if (!Number.isInteger(color) || color < 0 || color >= PLAYER_COLOR_COUNT) {
    throw new RuleError('Màu không hợp lệ');
  }
  if (!Number.isInteger(icon) || icon < 0 || icon >= PLAYER_ICON_COUNT) {
    throw new RuleError('Biểu tượng không hợp lệ');
  }
}

// ---------------------------------------------------------------------------
// Luồng lượt
// ---------------------------------------------------------------------------

function startTurn(s: GameState) {
  s.rolled = false;
  s.doublesCount = 0;
  s.extraRoll = false;
  s.lastDice = null;
  s.arrivedByRoll = false;
  const p = currentPlayer(s);
  s.pending = p.inJail ? { type: 'jail', playerId: p.id } : { type: 'roll', playerId: p.id };
}

function endTurn(s: GameState) {
  s.turnNumber += 1;
  for (let k = 1; k <= s.players.length; k++) {
    const i = (s.current + k) % s.players.length;
    if (s.players[i]!.status === 'active') {
      s.current = i;
      break;
    }
  }
  startTurn(s);
}

function endGame(s: GameState, loser: PlayerState, status: 'bankrupt' | 'surrendered') {
  loser.status = status;
  s.loserId = loser.id;
  s.queue = [];
  s.pending = { type: 'ended' };
  addLog(s, loser.id, status === 'bankrupt' ? 'Phá sản, thua cuộc' : 'Đầu hàng, thua cuộc');
}

/** Đưa các bước mới lên đầu hàng chờ (chúng xảy ra trước những việc đã xếp). */
function prepend(s: GameState, steps: Step[]) {
  s.queue = [...steps, ...s.queue];
}

/** Chạy hàng chờ cho đến khi cần người chơi làm gì đó, hoặc hết lượt. */
function advance(s: GameState, rng: Rng) {
  for (;;) {
    if (s.pending.type === 'ended') return;
    const step = s.queue.shift();
    if (!step) {
      const p = currentPlayer(s);
      if (p.status === 'active' && s.extraRoll && !p.inJail) {
        s.extraRoll = false;
        s.pending = { type: 'roll', playerId: p.id };
      } else {
        endTurn(s);
      }
      return;
    }
    if (enterStep(s, step, rng)) return;
  }
}

/** Bắt đầu một bước. Trả true nếu phải chờ người chơi. */
function enterStep(s: GameState, step: Step, rng: Rng): boolean {
  switch (step.type) {
    case 'moveAfterJail': {
      const p = getPlayer(s, step.playerId);
      p.inJail = false;
      p.jailAttempts = 0;
      moveForward(s, p, step.steps, true);
      s.arrivedByRoll = true;
      prepend(s, land(s, p, rng).steps);
      return false;
    }
    case 'fortuneMirror': {
      const holder = s.players.find(
        (x) =>
          x.status === 'active' &&
          x.id !== step.drawerId &&
          x.heldCards.some((c) => c.kind === 'fortuneMirror'),
      );
      if (!holder || step.net === 0) return false;
      takeCard(s, holder, 'fortuneMirror');
      const drawerReceived = step.net > 0;
      const payer = drawerReceived ? holder.id : step.drawerId;
      const payee = drawerReceived ? step.drawerId : holder.id;
      addLog(s, holder.id, 'Kẻ khóc người cười kích hoạt');
      prepend(s, [
        {
          type: 'pay',
          playerId: payer,
          creditors: [{ playerId: payee, amount: FORTUNE_MIRROR_AMOUNT }],
          total: FORTUNE_MIRROR_AMOUNT,
          reason: 'fortuneMirror',
          confirm: false,
          label: 'Kẻ khóc người cười',
        },
      ]);
      return false;
    }
    case 'pay': {
      const p = getPlayer(s, step.playerId);
      if (p.status !== 'active') return false;
      if (p.cash >= step.total) {
        if (step.confirm) {
          s.pending = step;
          return true;
        }
        executePay(s, step);
        return false;
      }
      if (p.cash + maxLiquidationValue(s, p.id) < step.total) {
        addLog(s, p.id, `Không đủ khả năng trả ${step.total}Đ`);
        endGame(s, p, 'bankrupt');
        return true;
      }
      s.pending = step;
      return true;
    }
    case 'buy':
    case 'upgrade':
    case 'metro':
    case 'chooseTile':
    case 'jailRelease':
    case 'roll':
    case 'jail':
      s.pending = step;
      return true;
    case 'ended':
      s.pending = step;
      return true;
  }
}

function executePay(s: GameState, step: Extract<Pending, { type: 'pay' }>) {
  const p = getPlayer(s, step.playerId);
  if (p.cash < step.total) throw new RuleError(`Chưa đủ tiền: cần ${step.total}Đ, có ${p.cash}Đ`);
  p.cash -= step.total;
  for (const c of step.creditors) {
    if (c.playerId !== null) getPlayer(s, c.playerId).cash += c.amount;
  }
  if (step.grantTile !== undefined) {
    const t = tileState(s, step.grantTile);
    t.owner = p.id;
    t.level = 0;
    t.mortgaged = false;
    t.boughtTurn = s.turnNumber;
  }
  const to = step.creditors
    .map((c) => (c.playerId === null ? 'Ngân hàng' : getPlayer(s, c.playerId).name))
    .join(', ');
  addLog(s, p.id, step.label ?? `Trả ${to}`, -step.total);
}

// ---------------------------------------------------------------------------
// Thao tác
// ---------------------------------------------------------------------------

export function applyAction(state: GameState, action: Action, rng: Rng): ActionResult {
  const s = JSON.parse(JSON.stringify(state)) as GameState;
  s.events = [];
  try {
    if (s.pending.type === 'ended') throw new RuleError('Ván đã kết thúc');
    handle(s, action, rng);
    return { ok: true, state: s };
  } catch (err) {
    if (err instanceof RuleError) return { ok: false, error: err.message };
    throw err;
  }
}

function expectPending<T extends Pending['type']>(
  s: GameState,
  playerId: string,
  ...types: T[]
): Extract<Pending, { type: T }> {
  const pd = s.pending;
  if (!(types as string[]).includes(pd.type)) throw new RuleError('Chưa tới bước này');
  if ('playerId' in pd && pd.playerId !== playerId) throw new RuleError('Chưa tới lượt bạn');
  return pd as Extract<Pending, { type: T }>;
}

function handle(s: GameState, a: Action, rng: Rng): void {
  switch (a.type) {
    case 'roll': {
      const pd = expectPending(s, a.playerId, 'roll', 'jail');
      return pd.type === 'roll' ? doRoll(s, rng) : doJailRoll(s, rng);
    }
    case 'payBail':
    case 'useJailCard': {
      const pd = expectPending(s, a.playerId, 'jail', 'jailRelease');
      const p = getPlayer(s, a.playerId);
      if (a.type === 'useJailCard') {
        if (!takeCard(s, p, 'jailFree')) throw new RuleError('Bạn không có thẻ ra tù');
        addLog(s, p.id, 'Dùng thẻ ra tù');
      }
      if (pd.type === 'jail') {
        if (a.type === 'payBail') {
          if (p.cash < JAIL_BAIL) throw new RuleError(`Cần ${JAIL_BAIL}Đ để bảo lãnh`);
          p.cash -= JAIL_BAIL;
          addLog(s, p.id, 'Trả bảo lãnh', -JAIL_BAIL);
        }
        p.inJail = false;
        p.jailAttempts = 0;
        s.pending = { type: 'roll', playerId: p.id };
        return;
      }
      if (a.type === 'payBail' && p.cash < JAIL_BAIL) {
        throw new RuleError(`Cần ${JAIL_BAIL}Đ để bảo lãnh, hãy dùng thẻ ra tù`);
      }
      const after: Step = { type: 'moveAfterJail', playerId: p.id, steps: pd.steps };
      prepend(s, a.type === 'payBail' ? [bailStep(p), after] : [after]);
      return advance(s, rng);
    }
    case 'buy': {
      const pd = expectPending(s, a.playerId, 'buy');
      const p = getPlayer(s, a.playerId);
      const tile = ownableTile(pd.tile);
      if (p.cash < tile.price) throw new RuleError('Không đủ tiền mua');
      p.cash -= tile.price;
      const t = tileState(s, pd.tile);
      t.owner = p.id;
      t.boughtTurn = s.turnNumber;
      addLog(s, p.id, `Mua ${tile.name}`, -tile.price);
      return advance(s, rng);
    }
    case 'declineBuy':
      expectPending(s, a.playerId, 'buy');
      return advance(s, rng);
    case 'upgrade': {
      const pd = expectPending(s, a.playerId, 'upgrade');
      const p = getPlayer(s, a.playerId);
      const t = tileState(s, pd.tile);
      const tile = ownableTile(pd.tile);
      if (pd.mode === 'build') {
        const prop = propertyTile(pd.tile);
        if (p.cash < prop.upgradeCost) throw new RuleError('Không đủ tiền nâng cấp');
        p.cash -= prop.upgradeCost;
        t.level += 1;
        addLog(s, p.id, `Nâng ${tile.name} lên cấp ${t.level}`, -prop.upgradeCost);
      } else {
        const cost =
          redeemCost(tile.price) +
          (pd.mode === 'redeemBuild' ? propertyTile(pd.tile).upgradeCost : 0);
        if (p.cash < cost) throw new RuleError('Không đủ tiền');
        p.cash -= cost;
        t.mortgaged = false;
        if (pd.mode === 'redeemBuild') t.level = 1;
        addLog(
          s,
          p.id,
          `Chuộc ${tile.name}${pd.mode === 'redeemBuild' ? ' và xây 1 nhà' : ''}`,
          -cost,
        );
      }
      return advance(s, rng);
    }
    case 'skipUpgrade':
      expectPending(s, a.playerId, 'upgrade');
      return advance(s, rng);
    case 'metro': {
      expectPending(s, a.playerId, 'metro');
      const p = getPlayer(s, a.playerId);
      if (a.destination !== null) {
        const d = a.destination;
        if (!Number.isInteger(d) || d < 0 || d >= BOARD_SIZE || d === METRO_INDEX) {
          throw new RuleError('Ô đích Metro không hợp lệ');
        }
        const fee = Math.floor((p.cash * METRO_FEE_PERCENT) / 100);
        p.cash -= fee;
        jumpTo(s, p, d);
        s.arrivedByRoll = false;
        addLog(s, p.id, `Đi Metro đến ${BOARD[d]!.name}`, -fee);
        prepend(s, land(s, p, rng).steps);
      }
      return advance(s, rng);
    }
    case 'pay': {
      const pd = expectPending(s, a.playerId, 'pay');
      executePay(s, pd);
      return advance(s, rng);
    }
    case 'manage':
      return manage(s, a.playerId, a.ops);
    case 'chooseTile': {
      const pd = expectPending(s, a.playerId, 'chooseTile');
      if (!pd.options.includes(a.tile)) throw new RuleError('Không chọn được ô này');
      chooseTile(s, pd, a.tile, rng);
      return advance(s, rng);
    }
    case 'surrender': {
      const p = getPlayer(s, a.playerId);
      if (p.status !== 'active') throw new RuleError('Bạn không còn trong ván');
      // Đang có khoản bắt buộc chờ (của bất kỳ ai) thì mọi thao tác khác bị khóa.
      const owes = (x: Step) => x.type === 'pay' && x.playerId === p.id;
      if (s.pending.type === 'pay' || s.pending.type === 'jailRelease' || s.queue.some(owes)) {
        throw new RuleError('Không đầu hàng được khi đang có khoản phải trả');
      }
      return endGame(s, p, 'surrendered');
    }
    case 'changeAppearance': {
      const p = getPlayer(s, a.playerId);
      checkAppearance(a.color, a.icon);
      const others = s.players.filter((x) => x.id !== p.id);
      if (others.some((x) => x.color === a.color)) throw new RuleError('Màu đã có người dùng');
      if (others.some((x) => x.icon === a.icon)) throw new RuleError('Biểu tượng đã có người dùng');
      p.color = a.color;
      p.icon = a.icon;
      return;
    }
    case 'timeout':
      return timeout(s, rng);
  }
}

function bailStep(p: PlayerState): Step {
  return {
    type: 'pay',
    playerId: p.id,
    creditors: [{ playerId: null, amount: JAIL_BAIL }],
    total: JAIL_BAIL,
    reason: 'jailBail',
    confirm: false,
    label: 'Trả bảo lãnh ra tù',
  };
}

function doRoll(s: GameState, rng: Rng) {
  const p = currentPlayer(s);
  const d1 = rollDie(rng);
  const d2 = rollDie(rng);
  s.rolled = true;
  s.lastDice = [d1, d2];
  s.events.push({ type: 'roll', playerId: p.id, dice: [d1, d2], jail: false });
  const double = d1 === d2;
  addLog(s, p.id, `Đổ ${d1} + ${d2}${double ? ' (đôi)' : ''}`);
  if (double) {
    s.doublesCount += 1;
    if (s.doublesCount >= MAX_DOUBLES_BEFORE_JAIL) {
      sendToJail(s, p);
      return advance(s, rng);
    }
  }
  s.extraRoll = double;
  moveForward(s, p, d1 + d2, true);
  s.arrivedByRoll = true;
  prepend(s, land(s, p, rng).steps);
  return advance(s, rng);
}

function doJailRoll(s: GameState, rng: Rng) {
  const p = currentPlayer(s);
  const d1 = rollDie(rng);
  const d2 = rollDie(rng);
  s.rolled = true;
  s.lastDice = [d1, d2];
  s.events.push({ type: 'roll', playerId: p.id, dice: [d1, d2], jail: true });
  p.jailAttempts += 1;
  addLog(s, p.id, `Thử đổ đôi trong tù: ${d1} + ${d2}`);
  if (d1 === d2) {
    // Ra tù bằng đôi: đi theo số vừa đổ, không có lượt thêm.
    prepend(s, [{ type: 'moveAfterJail', playerId: p.id, steps: d1 + d2 }]);
    return advance(s, rng);
  }
  if (p.jailAttempts < MAX_JAIL_TURNS) {
    // Ba lần thử đôi là một chuỗi liên tục trong cùng lượt:
    // trượt lần 1/2 thì hỏi lại chính người này, không chuyển sang người kế tiếp.
    s.pending = { type: 'jail', playerId: p.id };
    return;
  }
  // Trượt lần 3: không được thử nữa. Người chơi phải chọn trả 50Đ
  // hoặc dùng thẻ ra tù (nếu có), rồi đi theo tổng xúc xắc của lần thử thứ 3.
  s.pending = { type: 'jailRelease', playerId: p.id, steps: d1 + d2 };
  return;
}

const HIGHWAY_STEPS = (() => {
  const e = COMMUNITY_CARDS.find((c) => c.effect.type === 'highway')?.effect;
  if (e?.type !== 'highway') throw new Error('Thiếu thẻ Mở đường cao tốc');
  return e.stepsByDie;
})();

function chooseTile(
  s: GameState,
  pd: Extract<Pending, { type: 'chooseTile' }>,
  tile: number,
  rng: Rng,
) {
  const p = getPlayer(s, pd.playerId);
  const t = tileState(s, tile);
  if (pd.purpose === 'gambleUp') {
    t.level += 1;
    addLog(s, p.id, `Canh bạc: nâng miễn phí ${BOARD[tile]!.name}`);
    return;
  }
  if (pd.purpose === 'gambleDown') {
    t.level -= 1;
    addLog(s, p.id, `Canh bạc: hạ 1 cấp ${BOARD[tile]!.name}`);
    return;
  }
  const d = rollDie(rng) as 1 | 2 | 3 | 4 | 5 | 6;
  const steps = HIGHWAY_STEPS[d];
  const to = (tile + steps) % BOARD_SIZE;
  s.events.push({ type: 'highway', playerId: p.id, tile, die: d, to });
  jumpTo(s, p, to);
  s.arrivedByRoll = false;
  addLog(s, p.id, `Cao tốc từ ${BOARD[tile]!.name}, gieo ${d}: đến ${BOARD[p.position]!.name}`);
  prepend(s, land(s, p, rng).steps);
}

// ---------------------------------------------------------------------------
// Ụp/Mở và xử lý nợ
// ---------------------------------------------------------------------------

function manage(s: GameState, playerId: string, ops: ManageOp[]) {
  const p = getPlayer(s, playerId);
  if (p.status !== 'active') throw new RuleError('Bạn không còn trong ván');
  const pd = s.pending;
  const startOfTurn =
    currentPlayer(s).id === p.id && !s.rolled && (pd.type === 'roll' || pd.type === 'jail');
  const inDebt = pd.type === 'pay' && pd.playerId === p.id && p.cash < pd.total;
  if (!startOfTurn && !inDebt) {
    throw new RuleError('Chỉ Ụp/Mở được ở đầu lượt hoặc khi đang nợ');
  }
  if (!Array.isArray(ops) || ops.length === 0) throw new RuleError('Chưa có thay đổi nào');
  // Cả bản nháp được xác nhận một lần: chỉ cần tiền sau toàn bộ thao tác không âm.
  const mortgagedHere = new Set<number>();
  for (const op of ops) {
    if (op.op === 'redeem' && mortgagedHere.has(op.tile)) {
      throw new RuleError('Bản nháp vừa cắm rồi lại chuộc cùng một ô, hãy dùng nút + để hoàn lại');
    }
    if (op.op === 'mortgage') mortgagedHere.add(op.tile);
    applyManageOp(s, p, op, inDebt);
  }
  if (p.cash < 0) throw new RuleError('Không đủ tiền cho bản nháp này');
}

function applyManageOp(s: GameState, p: PlayerState, op: ManageOp, inDebt: boolean) {
  const t = tileState(s, op.tile);
  const tile = ownableTile(op.tile);
  if (t.owner !== p.id) throw new RuleError(`${tile.name} không phải của bạn`);
  switch (op.op) {
    case 'downgrade': {
      const prop = propertyTile(op.tile);
      if (t.level < 1) throw new RuleError(`${tile.name} không có công trình`);
      t.level -= 1;
      const refund = downgradeRefund(prop.upgradeCost);
      p.cash += refund;
      addLog(s, p.id, `Hạ ${tile.name} còn cấp ${t.level}`, refund);
      return;
    }
    case 'mortgage': {
      if (t.mortgaged) throw new RuleError(`${tile.name} đã cắm`);
      if (t.level > 0) throw new RuleError(`Phải hạ hết công trình trên ${tile.name} trước`);
      t.mortgaged = true;
      const value = mortgageValue(tile.price);
      p.cash += value;
      addLog(s, p.id, `Cắm ${tile.name}`, value);
      return;
    }
    case 'sell': {
      if (t.level > 0) throw new RuleError(`Phải hạ hết công trình trên ${tile.name} trước`);
      const value = sellValue(tile.price, t.mortgaged);
      p.cash += value;
      t.owner = null;
      t.mortgaged = false;
      t.boughtTurn = null;
      addLog(s, p.id, `Bán ${tile.name}`, value);
      expireTaxWaivers(s);
      return;
    }
    case 'redeem': {
      if (inDebt) throw new RuleError('Không chuộc được khi đang nợ');
      if (!t.mortgaged) throw new RuleError(`${tile.name} không bị cắm`);
      const cost = redeemCost(tile.price);
      p.cash -= cost;
      t.mortgaged = false;
      addLog(s, p.id, `Chuộc ${tile.name}`, -cost);
      return;
    }
    default:
      throw new RuleError('Thao tác không hợp lệ');
  }
}

/** Thanh lý mặc định khi hết giờ xử lý nợ (xem docs/luat-choi.md mục 11). */
function autoLiquidate(s: GameState, p: PlayerState, target: number) {
  const price = (i: number) => ownableTile(i).price;
  const byPrice = (a: number, b: number) => price(a) - price(b) || a - b;
  while (p.cash < target) {
    const owned = ownedTiles(s, p.id);
    const toMortgage = owned
      .filter((i) => !s.tiles[i]!.mortgaged && s.tiles[i]!.level === 0)
      .sort(byPrice)[0];
    if (toMortgage !== undefined) {
      applyManageOp(s, p, { op: 'mortgage', tile: toMortgage }, true);
      continue;
    }
    const rentNow = (i: number) => propertyTile(i).rents[s.tiles[i]!.level]!;
    const toDowngrade = owned
      .filter((i) => s.tiles[i]!.level > 0)
      .sort((a, b) => rentNow(a) - rentNow(b) || a - b)[0];
    if (toDowngrade !== undefined) {
      applyManageOp(s, p, { op: 'downgrade', tile: toDowngrade }, true);
      continue;
    }
    const toSell = owned.filter((i) => s.tiles[i]!.mortgaged).sort(byPrice)[0];
    if (toSell !== undefined) {
      applyManageOp(s, p, { op: 'sell', tile: toSell }, true);
      continue;
    }
    return;
  }
}

// ---------------------------------------------------------------------------
// Hết giờ
// ---------------------------------------------------------------------------

function timeout(s: GameState, rng: Rng): void {
  const pd = s.pending;
  switch (pd.type) {
    case 'roll':
      return handle(s, { type: 'roll', playerId: pd.playerId }, rng);
    case 'jail':
      // Thử đổ đôi; lần thứ 3 thất bại mà có thẻ thì dùng thẻ luôn, không chờ thêm 60 giây.
      handle(s, { type: 'roll', playerId: pd.playerId }, rng);
      if (s.pending.type === 'jailRelease' && s.pending.playerId === pd.playerId) {
        handle(s, { type: 'useJailCard', playerId: pd.playerId }, rng);
      }
      return;
    case 'jailRelease': {
      const p = getPlayer(s, pd.playerId);
      return handle(
        s,
        hasCard(p, 'jailFree')
          ? { type: 'useJailCard', playerId: pd.playerId }
          : { type: 'payBail', playerId: pd.playerId },
        rng,
      );
    }
    case 'buy':
      return handle(s, { type: 'declineBuy', playerId: pd.playerId }, rng);
    case 'upgrade':
      return handle(s, { type: 'skipUpgrade', playerId: pd.playerId }, rng);
    case 'metro':
      return handle(s, { type: 'metro', playerId: pd.playerId, destination: null }, rng);
    case 'pay': {
      const p = getPlayer(s, pd.playerId);
      autoLiquidate(s, p, pd.total);
      return handle(s, { type: 'pay', playerId: pd.playerId }, rng);
    }
    case 'chooseTile': {
      const p = getPlayer(s, pd.playerId);
      const tile =
        pd.purpose === 'highway'
          ? nearestAhead(p.position, 'property').index
          : Math.min(...pd.options);
      return handle(s, { type: 'chooseTile', playerId: pd.playerId, tile }, rng);
    }
    case 'ended':
      throw new RuleError('Ván đã kết thúc');
  }
}

// ---------------------------------------------------------------------------
// Tiện ích cho máy chủ và giao diện
// ---------------------------------------------------------------------------

/** Người được chờ ở bước hiện tại (null khi ván đã kết thúc). */
export const waitingFor = (s: GameState): string | null =>
  'playerId' in s.pending ? s.pending.playerId : null;

export const isGameOver = (s: GameState): boolean => s.pending.type === 'ended';

export const winners = (s: GameState): PlayerState[] =>
  isGameOver(s) ? s.players.filter((p) => p.id !== s.loserId) : [];
