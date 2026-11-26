// Снимок 3D-страницы. node gkcap.js <out.jpg> [query] [js] [w] [h] [waitMs] [--page]
//  query  — строка запроса, напр. "off=fx,cars" (модули: cars, parking, interior, fx; all — все выключить)
//  js     — код, выполняемый в странице после загрузки (можно await), напр. "GKScene.setMode('night')"
//  --page — снять страницу целиком вместе с интерфейсом (кадр холста подкладывается картинкой)
const { chromium } = require('playwright'); const fs = require('fs');
const a = process.argv.slice(2), page = a.includes('--page'), [out, query = '', js = '', w = '1000', h = '660', wait = '5000'] = a.filter(x => x !== '--page');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
  p.on('pageerror', e => console.log('PAGEERR ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
  p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log(m.type().toUpperCase() + ' ' + m.text().slice(0, 400)); });
  p.on('requestfailed', r => console.log('REQFAIL ' + r.url()));
  await p.goto('http://localhost:' + (process.env.GKPORT || 8822) + '/' + (query ? '?' + query : ''), { waitUntil: 'load' });
  await p.waitForFunction('window.GKScene && GKScene.ctx', null, { timeout: 30000 }).catch(() => console.log('NO GKScene.ctx'));
  await p.waitForTimeout(1500);
  if (js) { try { const r = await p.evaluate('(async () => { ' + js + ' })()'); if (r !== undefined) console.log('RESULT ' + JSON.stringify(r)); } catch (e) { console.log('EVALERR ' + e.message); } await p.waitForTimeout(+wait); }
  const t0 = Date.now();
  const url = await p.evaluate(() => { const c = GKScene.ctx; c.renderer.shadowMap.needsUpdate = true; c.render(); return document.getElementById('gl').toDataURL('image/jpeg', 0.9); });
  console.log('render ms ' + (Date.now() - t0));
  if (page) { await p.evaluate((u) => { const g = document.getElementById('gl'); g.style.visibility = 'hidden'; g.parentNode.style.background = 'url(' + u + ') center/100% 100% no-repeat'; }, url); await p.waitForTimeout(300); await p.screenshot({ path: out, type: 'jpeg', quality: 88 }); }
  else fs.writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
  await b.close();
})();
