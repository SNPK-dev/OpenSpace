import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const cssUrl = new URL('../src/renderer/src/index.css', import.meta.url)

test('server settings body fills the modal and keeps actions in a fixed footer', async () => {
  const css = await readFile(cssUrl, 'utf8')
  const bodyRule = css.match(/\.server-settings-body\s*\{([^}]*)\}/)?.[1] ?? ''
  const actionsRule = css.match(/\.settings-modal-actions\s*\{([^}]*)\}/)?.[1] ?? ''

  assert.match(bodyRule, /flex:\s*1(?:;|\s)/, 'settings body must fill available modal height')
  assert.match(bodyRule, /overflow:\s*hidden/, 'category scrolling must stay inside the settings content viewport')
  assert.match(actionsRule, /flex:\s*0\s+0\s+auto/, 'actions footer must not shrink')
  assert.match(actionsRule, /margin-top:\s*0/, 'footer position must not depend on category content height')
})
