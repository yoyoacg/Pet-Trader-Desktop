// 一次性压缩内置连续帧：缩到指定高度并重新编码为 WebP，用于减小安装包体积。
// 用法：node scripts/compress-frames.mjs [目录] [高度] [质量]，需要 PATH 中有 ffmpeg。
import { spawn } from 'node:child_process';
import { readdir, rename } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(process.argv[2] ?? fileURLToPath(new URL('../assets/pets/jyn/thumb/', import.meta.url)));
const height = process.argv[3] ?? '450';
const quality = process.argv[4] ?? '80';

const files = (await readdir(root, { recursive: true })).filter(file => file.endsWith('.webp')).map(file => path.join(root, file));

function encode(file) {
  const temp = `${file}.tmp.webp`;
  // 原图高度不超过目标时保持原尺寸；-2 让宽度按比例取偶数。
  const args = ['-loglevel', 'error', '-y', '-i', file, '-vf', `scale=-2:'min(${height},ih)':flags=lanczos`, '-c:v', 'libwebp', '-quality', quality, '-compression_level', '6', temp];
  return new Promise((resolve, reject) => {
    spawn('ffmpeg', args, { stdio: 'inherit' }).on('exit', code => code === 0 ? resolve(rename(temp, file)) : reject(new Error(`ffmpeg 失败：${file}`)));
  });
}

let next = 0;
let done = 0;
// 按 CPU 核数并发调用 ffmpeg，单个进程编码一张帧。
async function worker() {
  while (next < files.length) {
    await encode(files[next++]);
    if (++done % 100 === 0) console.log(`已压缩 ${done}/${files.length}`);
  }
}
await Promise.all(Array.from({ length: availableParallelism() }, worker));
console.log(`完成：${files.length} 张帧图 -> 高度 ${height}px，质量 ${quality}`);
