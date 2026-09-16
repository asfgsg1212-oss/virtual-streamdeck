import { useEffect, useState } from 'react'

type UpdateState =
  | { kind: 'idle' }
  | { kind: 'available'; version: string }
  | { kind: 'notAvailable' }
  | { kind: 'error'; message: string }
  | { kind: 'downloaded' }

export default function UpdateModal(): React.JSX.Element | null {
  const [state, setState] = useState<UpdateState>({ kind: 'idle' })

  useEffect(() => {
    const offs = [
      window.deck.onUpdateAvailable((version) => setState({ kind: 'available', version })),
      window.deck.onUpdateNotAvailable(() => setState({ kind: 'notAvailable' })),
      window.deck.onUpdateError((message) => setState({ kind: 'error', message })),
      window.deck.onUpdateDownloaded(() => setState({ kind: 'downloaded' }))
    ]
    return () => offs.forEach((off) => off())
  }, [])

  if (state.kind === 'idle') return null

  const close = (): void => setState({ kind: 'idle' })

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal">
        {state.kind === 'available' && (
          <>
            <h2>업데이트</h2>
            <p>새 버전 {state.version}이(가) 나왔습니다. 업데이트 하시겠습니까?</p>
            <div className="modal-actions">
              <div className="modal-actions-spacer" />
              <button type="button" className="btn-secondary" onClick={close}>
                나중에
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  window.deck.downloadUpdate()
                  close()
                }}
              >
                업데이트
              </button>
            </div>
          </>
        )}
        {state.kind === 'notAvailable' && (
          <>
            <h2>업데이트 확인</h2>
            <p>이미 최신 버전이에요.</p>
            <div className="modal-actions">
              <div className="modal-actions-spacer" />
              <button type="button" className="btn-primary" onClick={close}>
                확인
              </button>
            </div>
          </>
        )}
        {state.kind === 'error' && (
          <>
            <h2>업데이트 확인 실패</h2>
            <p>{state.message}</p>
            <div className="modal-actions">
              <div className="modal-actions-spacer" />
              <button type="button" className="btn-primary" onClick={close}>
                확인
              </button>
            </div>
          </>
        )}
        {state.kind === 'downloaded' && (
          <>
            <h2>업데이트 준비 완료</h2>
            <p>새 버전을 받았어요. 지금 재시작해서 적용할까요?</p>
            <div className="modal-actions">
              <div className="modal-actions-spacer" />
              <button type="button" className="btn-secondary" onClick={close}>
                나중에
              </button>
              <button type="button" className="btn-primary" onClick={() => window.deck.installUpdate()}>
                지금 재시작
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
