import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// 只下载固定提交的选定动画，不克隆整个仓库，也不执行上游程序。
const manifest = JSON.parse(await readFile(new URL('./vpet-downloads.json', import.meta.url), 'utf8'));
const destination = fileURLToPath(new URL('../assets/vpet/', import.meta.url));
for (let start = 0; start < manifest.files.length; start += 4) {
  await Promise.all(manifest.files.slice(start, start + 4).map(async ({file, path: source}) => {
    const url = `https://raw.githubusercontent.com/${manifest.repository}/${manifest.commit}/${source.split('/').map(encodeURIComponent).join('/')}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`下载 VPet 动画失败：${response.status} ${url}`);
    const target = path.join(destination, file);
    await mkdir(path.dirname(target), {recursive: true});
    await writeFile(target, new Uint8Array(await response.arrayBuffer()));
  }));
  console.log(`VPet 动画：${Math.min(start + 4, manifest.files.length)}/${manifest.files.length}`);
}
