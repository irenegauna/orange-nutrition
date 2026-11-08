import { useEffect } from 'react'

const TEXT_INPUT = /^(text|search|email|url|tel|password|number|)$/

const isTextField = (el: EventTarget | null): boolean => {
  if (!(el instanceof HTMLElement)) return false
  if (el instanceof HTMLTextAreaElement || el.isContentEditable) return true
  return el instanceof HTMLInputElement && TEXT_INPUT.test(el.type)
}

/**
 * On touch devices, adds `kb-open` to <html> while a text field is focused (i.e. the on-screen
 * keyboard is up). CSS then hides the bottom tab bar and lets bottom-docked bars (the Coach chat
 * box) sit directly above the keyboard instead of above a tab bar that iOS pushes up with it.
 */
export function useKeyboardOpenClass() {
  useEffect(() => {
    if (!window.matchMedia('(pointer: coarse)').matches) return
    const root = document.documentElement
    let timer: number | undefined
    const onIn = (e: FocusEvent) => {
      if (!isTextField(e.target)) return
      window.clearTimeout(timer)
      root.classList.add('kb-open')
    }
    // Delay so moving focus between two fields doesn't make the tab bar flash.
    const onOut = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        if (!isTextField(document.activeElement)) root.classList.remove('kb-open')
      }, 120)
    }
    document.addEventListener('focusin', onIn)
    document.addEventListener('focusout', onOut)
    return () => {
      document.removeEventListener('focusin', onIn)
      document.removeEventListener('focusout', onOut)
      window.clearTimeout(timer)
      root.classList.remove('kb-open')
    }
  }, [])
}
