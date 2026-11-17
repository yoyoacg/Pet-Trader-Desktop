// 人偶尺寸固定；无气泡时仅保留动画所需的边缘余量。
const PET_SIZE = {width: 226, height: 220};
const PET_DOCK_SIZE = {width: 280, height: 330};
const PET_BODY_SIZE = {width: 205, height: 190};

function petBodyBounds(bounds, size, body) {
  return {x: bounds.x + (size.width - body.width) / 2, y: bounds.y + size.height - 10 - body.height, ...body};
}

function movePetWindow(pet, x, y, size) {
  // 参考 dsh-pet：明确提交内容区矩形，避免 setPosition 的尺寸回读累积 DPI 取整误差。
  pet.setContentBounds({x: Math.round(x), y: Math.round(y), ...size}, false);
}

function movePetBody(pet, x, y, size, body) {
  const offset = petBodyBounds({x: 0, y: 0}, size, body);
  movePetWindow(pet, x - offset.x, y - offset.y, size);
}

module.exports = {PET_SIZE, PET_DOCK_SIZE, PET_BODY_SIZE, petBodyBounds, movePetBody};
