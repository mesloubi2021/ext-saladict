import {
  getText,
  getSentence,
  getTextFromSelection,
  getSentenceFromSelection
} from 'get-selection-more'
import { message } from '@/_helpers/browser-api'
import { createConfigStream } from '@/_helpers/config-manager'
import { isInDictPanel } from '@/_helpers/saladict'

import { share, map, switchMap } from 'rxjs/operators'

import { postMessageHandler, sendMessage, sendEmptyMessage } from './message'
import {
  isEscapeKey,
  whenKeyPressed,
  isBlacklisted,
  newSelectionWord
} from './helper'
import { createIntantCaptureStream } from './instant-capture'
import { createQuickSearchStream } from './quick-search'
import { createSelectTextStream } from './select-text'

// Firefox somehow loads it two times
if (!window.__SALADICT_SELECTION_LOADED__) {
  window.__SALADICT_SELECTION_LOADED__ = true

  const config$$ = createConfigStream().pipe(
    map(config => (isBlacklisted(config) ? null : config)),
    share()
  )

  /**
   * Send selection to standalone page
   * Beware that this is run on every frame.
   */
  message.addListener('PRELOAD_SELECTION', () => {
    const text = getText()
    if (text) {
      return newSelectionWord({
        text,
        context: getSentence()
      })
    }
  })

  /**
   * Manually emit selection
   * Beware that this is run on every frame.
   */
  message.createStream('EMIT_SELECTION').subscribe(async () => {
    const selection = window.getSelection()
    if (selection && selection.rangeCount > 0) {
      const text = getTextFromSelection(selection)
      const rect = selection.getRangeAt(0).getBoundingClientRect()
      if (text) {
        sendMessage({
          mouseX: rect.right,
          mouseY: rect.top,
          instant: true,
          self: isInDictPanel(selection.anchorNode),
          word: await newSelectionWord({
            text,
            context: getSentenceFromSelection(selection)
          }),
          dbClick: false,
          altKey: false,
          shiftKey: false,
          ctrlKey: false,
          metaKey: false,
          force: false
        })
      }
    }
  })

  /** Pass through message from iframes */
  window.addEventListener('message', postMessageHandler)

  /**
   * Escape key pressed
   */
  whenKeyPressed(isEscapeKey).subscribe(() =>
    message.self.send({ type: 'ESCAPE_KEY' })
  )

  config$$.pipe(switchMap(createQuickSearchStream)).subscribe(() => {
    message.self.send({ type: 'TRIPLE_CTRL' })
  })

  config$$.pipe(switchMap(createSelectTextStream)).subscribe(async result => {
    if (result.word) {
      sendMessage({
        dbClick: false,
        altKey: false,
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
        self: false,
        instant: false,
        force: false,
        ...result,
        word: await newSelectionWord(result.word)
      })
    } else {
      sendEmptyMessage(result.self)
    }
  })

  config$$
    .pipe(switchMap(createIntantCaptureStream))
    .subscribe(async ({ word, event, self }) => {
      sendMessage({
        word: await newSelectionWord(word),
        altKey: event.altKey,
        shiftKey: event.shiftKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        dbClick: false,
        force: false,
        instant: true,
        mouseX: event.clientX,
        mouseY: event.clientY,
        self
      })
    })
}
