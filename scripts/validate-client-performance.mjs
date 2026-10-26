import { readFile } from 'node:fs/promises'

for (const root of ['apps/web-client/src', 'apps/desktop-win/src/renderer/src']) {
  const main = await readFile(`${root}/components/MainLayout.tsx`, 'utf8')
  const chat = await readFile(`${root}/panes/ChatPane.tsx`, 'utf8')
  const people = await readFile(`${root}/panes/PeoplePane.tsx`, 'utf8')
  if (!main.includes("React.lazy(() => import('../panes/VoicePane'))")) throw new Error(`${root}: VoicePane must remain lazy`)
  if (!chat.includes('MAX_RENDERED_MESSAGES = 500') || !chat.includes('boundedMessages')) throw new Error(`${root}: message rendering must remain bounded`)
  if (!people.includes('MAX_MEMBER_RESULTS = 200') || !people.includes('MAX_SEARCH_LENGTH = 80')) throw new Error(`${root}: member results and query must remain bounded`)
}

for (const config of ['apps/web-client/vite.config.ts', 'apps/desktop-win/electron.vite.config.ts']) {
  const text = await readFile(config, 'utf8')
  for (const chunk of ['rtc-livekit', 'vendor-router', 'vendor-react']) {
    if (!text.includes(chunk)) throw new Error(`${config}: missing ${chunk} split`)
  }
}

console.log('Client lazy-loading and bounded-list baseline passed')
