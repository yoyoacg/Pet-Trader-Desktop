const {petBodyBounds, movePetBody} = require('./pet-window.cjs');

// 参考 dsh-pet 的轨迹估速、重力和碰边恢复系数；统一驱动游走、拖拽与甩抛。
function startRoaming(pet, screen, getGeometry) {
  let enabled = true;
  let target = null;
  let drag = null;
  let flight = null;
  let restUntil = Date.now() + 4000 + Math.random() * 8000;
  let lastTick = performance.now();
  let motion = 'idle';
  let lastGaze = {x: 0, y: 0};
  const body = () => {const geometry = getGeometry();return petBodyBounds(pet.getContentBounds(), geometry.size, geometry.body);};
  const move = (x, y) => {const geometry = getGeometry();movePetBody(pet, x, y, geometry.size, geometry.body);};
  function pushGaze(cursor, bounds) {
    // 全局鼠标位置映射到 [-1, 1] 归一化注视方向，变化足够明显时再通知渲染进程。
    const cx = bounds.x + bounds.width / 2;
    const cy = bounds.y + bounds.height * 0.35;
    const gx = Math.max(-1, Math.min(1, (cursor.x - cx) / 360));
    const gy = Math.max(-1, Math.min(1, (cursor.y - cy) / 360));
    if (Math.abs(gx - lastGaze.x) + Math.abs(gy - lastGaze.y) >= 0.03) {
      lastGaze = {x: gx, y: gy};
      pet.webContents.send('pet:gaze', lastGaze);
    }
  }
  function setMotion(value) {
    if (motion === value) return;
    motion = value;
    pet.webContents.send('pet:motion', value);
  }
  function rest() {
    target = null;
    restUntil = Date.now() + 4000 + Math.random() * 8000;
    setMotion('idle');
  }
  function limits(bounds) {
    const work = screen.getDisplayMatching({x: Math.round(bounds.x), y: Math.round(bounds.y), width: bounds.width, height: bounds.height}).workArea;
    return {minX: work.x, minY: work.y, maxX: work.x + work.width - bounds.width, maxY: work.y + work.height - bounds.height};
  }
  function startDrag() {
    flight = null;
    rest();
    const cursor = screen.getCursorScreenPoint();
    drag = {body: body(), cursor, samples: [{...cursor, time: performance.now()}]};
  }
  function moveDrag() {
    const point = screen.getCursorScreenPoint();
    const now = performance.now();
    move(drag.body.x + point.x - drag.cursor.x, drag.body.y + point.y - drag.cursor.y);
    drag.samples = drag.samples.filter(sample => now - sample.time <= 150);
    drag.samples.push({...point, time: now});
  }
  function endDrag(throwOnRelease) {
    // 松开与指针捕获丢失可以连续到达，同一次拖拽只结束一次。
    if (drag === null) return;
    const samples = drag.samples;
    drag = null;
    rest();
    const bounds = body(), area = limits(bounds);
    const x = Math.max(area.minX, Math.min(area.maxX, bounds.x));
    const y = Math.max(area.minY, Math.min(area.maxY, bounds.y));
    move(x, y);
    // 慢速拖动、按住停顿后松手或取消捕获都属于放下，不启动飞行。
    if (!throwOnRelease || samples.length < 2) return;
    const first = samples[0], last = samples[samples.length - 1];
    const elapsed = last.time - first.time;
    if (performance.now() - last.time > 150 || elapsed < 20) return;
    const vx = (last.x - first.x) / elapsed * 1000;
    const vy = (last.y - first.y) / elapsed * 1000;
    const speed = Math.hypot(vx, vy);
    if (speed < 500) return;
    const released = 3600 * (1 - Math.exp(-speed / 3600));
    flight = {x, y, vx: vx / speed * released, vy: vy / speed * released, area};
  }
  function stepFlight(elapsed) {
    const state = flight;
    // 已经贴住地面时保持接触，只有离地或仍有竖直速度时施加重力。
    if (state.y < state.area.maxY || state.vy !== 0) state.vy += 1400 * elapsed;
    state.x += state.vx * elapsed;
    state.y += state.vy * elapsed;
    let impact = null;
    if (state.x < state.area.minX || state.x > state.area.maxX) {
      impact = {axis: 'x', speed: Math.abs(state.vx)};
      state.x = Math.max(state.area.minX, Math.min(state.area.maxX, state.x));
      state.vx *= -.78;
    }
    if (state.y < state.area.minY || state.y >= state.area.maxY) {
      const speed = Math.abs(state.vy);
      if (impact === null || speed > impact.speed) impact = {axis: 'y', speed};
      const floor = state.y >= state.area.maxY;
      state.y = floor ? state.area.maxY : state.area.minY;
      // 低速落地后贴住地面，水平摩擦持续减速，避免重力造成原地小抖动。
      state.vy = floor && speed < 40 ? 0 : -state.vy * .78;
      state.vx *= Math.exp(-2.5 * elapsed);
    }
    move(state.x, state.y);
    if (impact !== null && impact.speed >= 80) pet.webContents.send('pet:impact', impact);
    if (state.y === state.area.maxY && state.vy === 0 && Math.abs(state.vx) < 15) {flight = null;rest();}
  }
  const timer = setInterval(() => {
    const now = performance.now();
    // 按经过时间积分，单步限制为 50ms，窗口调度变慢时不跨越整个屏幕。
    const elapsed = Math.min((now - lastTick) / 1000, .05);
    lastTick = now;
    if (!pet.isVisible()) {setMotion('idle');return;}
    const bounds = body();
    const cursor = screen.getCursorScreenPoint();
    pushGaze(cursor, bounds);
    if (drag !== null) {setMotion('idle');return;}
    if (flight !== null) {stepFlight(elapsed);return;}
    if (!enabled || Date.now() < restUntil) {setMotion('idle');return;}
    if (cursor.x >= bounds.x && cursor.x < bounds.x + bounds.width && cursor.y >= bounds.y && cursor.y < bounds.y + bounds.height) {target = null;setMotion('idle');return;}
    const area = limits(bounds);
    if (target === null) target = {x: area.minX + Math.random() * (area.maxX - area.minX), y: area.minY + Math.random() * (area.maxY - area.minY)};
    const dx = target.x - bounds.x, dy = target.y - bounds.y;
    const distance = Math.hypot(dx, dy), step = Math.min(distance, 60 * elapsed);
    if (distance <= Math.max(step, 1)) {move(target.x, target.y);rest();return;}
    setMotion(dx < 0 ? 'walkLeft' : 'walkRight');
    move(bounds.x + dx / distance * step, bounds.y + dy / distance * step);
  }, 1000 / 30);
  pet.once('closed', () => clearInterval(timer));
  return {startDrag, moveDrag, endDrag, setEnabled(value) {enabled = value;flight = null;drag = null;rest();}};
}

module.exports = {startRoaming};
