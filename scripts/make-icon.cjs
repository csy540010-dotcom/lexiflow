// 生成应用图标 build/icon.png（1024×1024，深绿插画风；electron-builder 会自动转为 .ico）
'use strict'
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

app.setPath('userData', path.join(app.getPath('appData'), 'lexiflow-icongen'))

const DRAW = `
const c = document.getElementById('c').getContext('2d')
function rr(x, y, w, h, r) {
  c.beginPath()
  c.moveTo(x + r, y)
  c.arcTo(x + w, y, x + w, y + h, r)
  c.arcTo(x + w, y + h, x, y + h, r)
  c.arcTo(x, y + h, x, y, r)
  c.arcTo(x, y, x + w, y, r)
  c.closePath()
}
const g = c.createLinearGradient(80, 80, 944, 944)
g.addColorStop(0, '#4d8a74')
g.addColorStop(1, '#1f3d2f')
rr(72, 72, 880, 880, 200)
c.fillStyle = g
c.fill()
c.save()
rr(72, 72, 880, 880, 200)
c.clip()
// 晨光
c.fillStyle = 'rgba(242, 217, 138, 0.85)'
c.beginPath(); c.arc(730, 300, 66, 0, 7); c.fill()
c.fillStyle = 'rgba(242, 217, 138, 0.25)'
c.beginPath(); c.arc(730, 300, 106, 0, 7); c.fill()
// 远山
c.fillStyle = 'rgba(255, 255, 255, 0.16)'
c.beginPath()
c.moveTo(72, 780); c.lineTo(300, 560); c.lineTo(470, 740); c.lineTo(640, 570); c.lineTo(952, 790)
c.lineTo(952, 952); c.lineTo(72, 952); c.closePath(); c.fill()
// 近山
c.fillStyle = 'rgba(255, 255, 255, 0.26)'
c.beginPath()
c.moveTo(72, 880); c.lineTo(260, 730); c.lineTo(430, 862); c.lineTo(620, 730); c.lineTo(952, 900)
c.lineTo(952, 952); c.lineTo(72, 952); c.closePath(); c.fill()
c.restore()
// 字母 L
c.save()
c.fillStyle = '#ffffff'
c.font = '600 430px Georgia, "Times New Roman", serif'
c.textAlign = 'center'
c.textBaseline = 'middle'
c.shadowColor = 'rgba(0, 0, 0, 0.28)'
c.shadowBlur = 36
c.shadowOffsetY = 12
c.fillText('L', 512, 440)
c.restore()
`

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1024,
    height: 1024,
    useContentSize: true,
    show: false,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: { offscreen: false }
  })
  const html = `<!doctype html><html><body style="margin:0;background:transparent"><canvas id="c" width="1024" height="1024"></canvas><script>${DRAW}</script></body></html>`
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
  await new Promise((r) => setTimeout(r, 500))
  const img = await win.webContents.capturePage()
  const outDir = path.join(__dirname, '..', 'build')
  fs.mkdirSync(outDir, { recursive: true })
  const outFile = path.join(outDir, 'icon.png')
  fs.writeFileSync(outFile, img.toPNG())
  const size = fs.statSync(outFile).size
  console.log('ICON_SAVED', outFile, size + ' bytes')
  app.quit()
})
