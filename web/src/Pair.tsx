// Linking two browsers with WebRTC: two codes cross by QR (or paste). No server, no internet.
import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import type { Net } from './net'

function QR({ text }: { text: string }) {
  const [svg, setSvg] = useState('')
  useEffect(() => {
    QRCode.toString(text, { type: 'svg', margin: 1, errorCorrectionLevel: 'L', color: { dark: '#111111', light: '#f7f7f7' } }).then(setSvg)
  }, [text])
  return (
    <div className="qr-wrap" data-code={text}>
      <div className="qr" dangerouslySetInnerHTML={{ __html: svg }} />
      <button className="chip-btn" onClick={() => navigator.clipboard?.writeText(text)}>
        Copy code
      </button>
    </div>
  )
}

declare class BarcodeDetector {
  constructor(o: { formats: string[] })
  detect(src: HTMLVideoElement): Promise<{ rawValue: string }[]>
}

/** Camera scanning where the browser can decode QR codes; pasting always works. */
function Read({ onCode, label }: { onCode: (code: string) => void; label: string }) {
  const video = useRef<HTMLVideoElement>(null)
  const [camera, setCamera] = useState(false)
  const [text, setText] = useState('')
  const canScan = 'BarcodeDetector' in window && !!navigator.mediaDevices
  useEffect(() => {
    if (!camera) return
    let stream: MediaStream | undefined
    let timer: ReturnType<typeof setInterval> | undefined
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }).then(s => {
      stream = s
      video.current!.srcObject = s
      video.current!.play()
      const detector = new BarcodeDetector({ formats: ['qr_code'] })
      timer = setInterval(async () => {
        const [hit] = await detector.detect(video.current!).catch(() => [])
        if (hit) {
          clearInterval(timer)
          onCode(hit.rawValue)
        }
      }, 300)
    })
    return () => {
      clearInterval(timer)
      stream?.getTracks().forEach(t => t.stop())
    }
  }, [camera, onCode])
  return (
    <div className="read">
      <div className="muted small">{label}</div>
      {camera ? <video ref={video} className="scanner" muted playsInline /> : canScan && <button className="btn wide" onClick={() => setCamera(true)}><b>Scan with the camera</b></button>}
      <div className="paste">
        <input placeholder="…or paste the code" value={text} onChange={e => setText(e.target.value)} />
        <button className="chip-btn" disabled={!text.trim()} onClick={() => onCode(text.trim())}>
          Use code
        </button>
      </div>
    </div>
  )
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <b>{title}</b>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

/** Resolves once the carrier reports a connection for `handle`. */
function connected(net: Net, handle: object) {
  return new Promise<void>(resolve => {
    const f = (e: Event) => {
      const d = (e as CustomEvent).detail
      if (d.connection === handle && d.state === 'connected') {
        net.rtc.removeEventListener('connection', f)
        resolve()
      }
    }
    net.rtc.addEventListener('connection', f)
  })
}

/** The host's side: show an offer, read the answer back. */
export function HostPair({ net, onClose }: { net: Net; onClose: () => void }) {
  const [offer, setOffer] = useState<Awaited<ReturnType<Net['rtc']['offer']>> | null>(null)
  const [step, setStep] = useState<'show' | 'linking' | 'error'>('show')
  const [error, setError] = useState('')
  const linked = useRef(false)
  useEffect(() => {
    let o: typeof offer = null
    net.rtc.offer().then(
      x => setOffer((o = x)),
      e => {
        setStep('error')
        setError(String(e))
      },
    )
    return () => {
      if (o && !linked.current) o.close() // an unused offer holds a peer connection open
    }
  }, [net])
  const accept = async (code: string) => {
    try {
      linked.current = true
      setStep('linking')
      const done = connected(net, offer!)
      await offer!.accept(code)
      await done
      onClose()
    } catch (e) {
      setStep('error')
      setError(String(e))
    }
  }
  return (
    <Modal title="Add a browser" onClose={onClose}>
      {step === 'error' ? (
        <p className="error">{error}</p>
      ) : step === 'linking' ? (
        <p className="muted">Connecting over your Wi-Fi…</p>
      ) : !offer ? (
        <p className="muted">Making a code…</p>
      ) : (
        <>
          <p className="muted small">1. On the other browser, choose Join → Join with a code, and scan this.</p>
          <QR text={offer.code} />
          <Read label="2. Then scan the code it shows back." onCode={accept} />
        </>
      )}
    </Modal>
  )
}

/** The joining side: read the host's offer, show an answer. */
export function GuestPair({ net, onClose }: { net: Net; onClose: () => void }) {
  const [answer, setAnswer] = useState<string | null>(null)
  const [error, setError] = useState('')
  const read = async (code: string) => {
    try {
      const a = await net.rtc.answer(code)
      setAnswer(a.code)
      await connected(net, a)
      onClose()
    } catch (e) {
      setError(String(e))
    }
  }
  return (
    <Modal title="Join with a code" onClose={onClose}>
      {error ? <p className="error">{error}</p> : answer ? (
        <>
          <p className="muted small">2. Show this to the host to finish.</p>
          <QR text={answer} />
          <p className="muted small">Both devices must be on the same Wi-Fi.</p>
        </>
      ) : (
        <Read label="1. Scan the code on the host's screen (Add a browser)." onCode={read} />
      )}
    </Modal>
  )
}
