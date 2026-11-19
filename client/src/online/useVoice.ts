import { useCallback, useEffect, useRef, useState } from 'react';
import type { Ack, Seat, SeatTicket, VoiceSignal } from '@cotiphu/shared';
import { setVoiceDucking } from '../audio/gameAudio';
import { getSocket, request } from './socket';

/**
 * Nói chuyện bằng giọng trong phòng: mỗi cặp máy nối thẳng với nhau bằng WebRTC (2–6 người nên
 * nối tất cả với tất cả), máy chủ chỉ chuyển tín hiệu bắt tay. Vào phòng là nối kênh để nghe;
 * nút mic chỉ bật / tắt tiếng của mình (không cần bắt tay lại).
 */
export interface Voice {
  /** Trình duyệt có WebRTC và mic (trang phải mở bằng https hoặc localhost). */
  supported: boolean;
  micOn: boolean;
  /** Đang xin quyền mic. */
  busy: boolean;
  /** Bật / tắt mic; trả lỗi tiếng Việt hoặc null. */
  toggleMic(): Promise<string | null>;
}

const ICE_SERVERS: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
];

interface Peer {
  pc: RTCPeerConnection;
  audio: HTMLAudioElement;
  /** Ứng viên ICE tới trước khi có mô tả của máy kia. */
  pendingIce: RTCIceCandidateInit[];
}

const supported = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.RTCPeerConnection === 'function' &&
  typeof navigator.mediaDevices?.getUserMedia === 'function';

function micError(err: unknown): string {
  const name = err instanceof DOMException ? err.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Bạn chưa cho phép dùng mic. Mở quyền mic cho trang này rồi thử lại.';
  }
  if (name === 'NotFoundError') return 'Không tìm thấy mic trên máy này.';
  return 'Không bật được mic.';
}

/**
 * `active`: máy đang nối máy chủ và đang ở trong phòng. `ticket` đổi (vào lại ghế) thì nối lại
 * kênh. `seats`: để biết ai đã rời kênh và có ai đang bật mic (để vặn nhỏ nhạc nền).
 */
export function useVoice(
  active: boolean,
  ticket: SeatTicket | null,
  seats: readonly Seat[] | null,
): Voice {
  const peers = useRef(new Map<string, Peer>());
  const track = useRef<MediaStreamTrack | null>(null);
  const [micOn, setMicOn] = useState(false);
  const [busy, setBusy] = useState(false);

  const emitSignal = useCallback((to: string, signal: VoiceSignal) => {
    getSocket().emit('voice:signal', { to, signal }, () => {});
  }, []);

  const closePeer = useCallback((id: string) => {
    const peer = peers.current.get(id);
    if (!peer) return;
    peers.current.delete(id);
    peer.pc.onicecandidate = null;
    peer.pc.ontrack = null;
    peer.pc.close();
    peer.audio.srcObject = null;
    peer.audio.remove();
  }, []);

  const closeAll = useCallback(() => {
    for (const id of [...peers.current.keys()]) closePeer(id);
  }, [closePeer]);

  /** Trình duyệt chặn tự phát tiếng khi chưa chạm trang: chạm lần đầu thì phát lại. */
  const unlock = useCallback(() => {
    const retry = () => {
      for (const p of peers.current.values()) void p.audio.play().catch(() => {});
    };
    document.addEventListener('pointerdown', retry, { once: true });
  }, []);

  const createPeer = useCallback(
    (id: string): Peer => {
      closePeer(id);
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      const audio = document.createElement('audio');
      audio.autoplay = true;
      audio.setAttribute('playsinline', '');
      audio.hidden = true;
      document.body.append(audio);
      const peer: Peer = { pc, audio, pendingIce: [] };
      peers.current.set(id, peer);
      pc.onicecandidate = (e) => {
        if (!e.candidate) return;
        emitSignal(id, {
          kind: 'ice',
          candidate: e.candidate.candidate,
          sdpMid: e.candidate.sdpMid,
          sdpMLineIndex: e.candidate.sdpMLineIndex,
        });
      };
      pc.ontrack = (e) => {
        audio.srcObject = e.streams[0] ?? new MediaStream([e.track]);
        void audio.play().catch(unlock);
      };
      return peer;
    },
    [closePeer, emitSignal, unlock],
  );

  const flushIce = async (peer: Peer) => {
    for (const c of peer.pendingIce.splice(0)) {
      await peer.pc.addIceCandidate(c).catch(() => {});
    }
  };

  /** Máy vào kênh sau gọi tới máy đã ở trong kênh. */
  const call = useCallback(
    async (id: string) => {
      const peer = createPeer(id);
      const t = peer.pc.addTransceiver('audio', { direction: 'sendrecv' });
      if (track.current) await t.sender.replaceTrack(track.current);
      const offer = await peer.pc.createOffer();
      await peer.pc.setLocalDescription(offer);
      if (peers.current.get(id) === peer) emitSignal(id, { kind: 'offer', sdp: offer.sdp ?? '' });
    },
    [createPeer, emitSignal],
  );

  // Nhận tín hiệu từ máy khác.
  useEffect(() => {
    if (!supported()) return;
    const s = getSocket();
    const onSignal = async ({ from, signal }: { from: string; signal: VoiceSignal }) => {
      try {
        if (signal.kind === 'offer') {
          const peer = createPeer(from);
          await peer.pc.setRemoteDescription({ type: 'offer', sdp: signal.sdp });
          const t = peer.pc.getTransceivers()[0];
          if (t) {
            t.direction = 'sendrecv';
            if (track.current) await t.sender.replaceTrack(track.current);
          }
          await flushIce(peer);
          const answer = await peer.pc.createAnswer();
          await peer.pc.setLocalDescription(answer);
          if (peers.current.get(from) === peer) {
            emitSignal(from, { kind: 'answer', sdp: answer.sdp ?? '' });
          }
        } else if (signal.kind === 'answer') {
          const peer = peers.current.get(from);
          if (!peer || peer.pc.signalingState !== 'have-local-offer') return;
          await peer.pc.setRemoteDescription({ type: 'answer', sdp: signal.sdp });
          await flushIce(peer);
        } else if (signal.kind === 'ice') {
          const peer = peers.current.get(from);
          if (!peer) return;
          const c: RTCIceCandidateInit = {
            candidate: signal.candidate,
            sdpMid: signal.sdpMid,
            sdpMLineIndex: signal.sdpMLineIndex,
          };
          if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(c).catch(() => {});
          else peer.pendingIce.push(c);
        }
      } catch (err) {
        console.warn('Lỗi kết nối giọng nói', err);
      }
    };
    s.on('voice:signal', onSignal);
    return () => {
      s.off('voice:signal', onSignal);
    };
  }, [createPeer, emitSignal]);

  // Vào kênh khi ở trong phòng (và vào lại sau khi rớt mạng / tải lại trang).
  useEffect(() => {
    if (!active || !ticket || !supported()) return;
    let cancelled = false;
    void (async () => {
      const s = getSocket();
      const res = await request<Ack<string[]>>((done) => s.emit('voice:join', done));
      if (cancelled || !res?.ok) return;
      if (track.current) s.emit('voice:mic', true, () => {});
      for (const id of res.data) void call(id).catch(() => closePeer(id));
    })();
    return () => {
      cancelled = true;
      closeAll();
    };
  }, [active, ticket, call, closeAll, closePeer]);

  // Ai rời kênh (tắt trang, mất mạng) thì bỏ kết nối tới người đó.
  const inVoice = useRef(new Set<string>());
  useEffect(() => {
    const now = new Set((seats ?? []).filter((x) => x.voice && x.connected).map((x) => x.id));
    for (const id of inVoice.current) if (!now.has(id)) closePeer(id);
    inVoice.current = now;
  }, [seats, closePeer]);

  // Có người bật mic thì vặn nhỏ nhạc nền.
  const anyMic = active && (seats ?? []).some((x) => x.mic && x.connected);
  useEffect(() => {
    setVoiceDucking(anyMic);
  }, [anyMic]);

  // Rời phòng: tắt mic.
  useEffect(() => {
    if (ticket) return;
    track.current?.stop();
    track.current = null;
    setMicOn(false);
  }, [ticket]);

  const toggleMic = useCallback(async (): Promise<string | null> => {
    if (!supported()) return 'Trình duyệt này không hỗ trợ nói chuyện (cần mở trang bằng https).';
    const s = getSocket();
    if (track.current) {
      track.current.stop();
      track.current = null;
      for (const p of peers.current.values()) {
        await p.pc
          .getTransceivers()[0]
          ?.sender.replaceTrack(null)
          .catch(() => {});
      }
      setMicOn(false);
      s.emit('voice:mic', false, () => {});
      return null;
    }
    setBusy(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const t = stream.getAudioTracks()[0];
      if (!t) return 'Không tìm thấy mic trên máy này.';
      track.current = t;
      for (const p of peers.current.values()) {
        await p.pc
          .getTransceivers()[0]
          ?.sender.replaceTrack(t)
          .catch(() => {});
      }
      setMicOn(true);
      const res = await request<Ack>((done) => s.emit('voice:mic', true, done));
      return res && !res.ok ? res.error : null;
    } catch (err) {
      return micError(err);
    } finally {
      setBusy(false);
    }
  }, []);

  return { supported: supported(), micOn, busy, toggleMic };
}
