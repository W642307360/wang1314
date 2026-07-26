const APP_URL = '/service'
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()))

self.addEventListener('push', event => {
  let data = { title: '福宠客服有新咨询', body: '有顾客发来了新消息', url: APP_URL, badge: 1, tag: 'fuchong-agent' }
  try { data = { ...data, ...event.data.json() } } catch {}
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const visible = windows.find(client => client.url.includes('/service') && client.visibilityState === 'visible')
    for (const client of windows) client.postMessage({ type: 'SERVICE_MESSAGE', data })
    if (visible) return
    if (self.registration.setAppBadge) await self.registration.setAppBadge(Number(data.badge || 1)).catch(() => {})
    await self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/service-icon-192.png',
      badge: '/service-icon-192.png',
      tag: data.tag,
      renotify: true,
      data: { url: data.url || APP_URL },
    })
  })())
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil((async () => {
    const target = new URL(event.notification.data?.url || APP_URL, self.location.origin).href
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const existing = windows.find(client => client.url.includes('/service'))
    if (existing) { await existing.navigate(target); return existing.focus() }
    return self.clients.openWindow(target)
  })())
})
