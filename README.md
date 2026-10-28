# 30Talk Web App v0.1

静态公开网站：YouTube 播放、中文/英文字幕、时间轴跳转、播放进度本地保存。

## 合并到已有 GitHub 仓库

将本包中的 `src/`、`scripts/build-content.mjs`、`index.html`、`package.json`、`tsconfig.json`、`public/` 和 `.gitignore` 复制到已有 `~/4Fun/30Talk` 仓库根目录。**不要覆盖已有的** `content/`、`scripts/process_video.sh`、`scripts/validate_subtitles.py`、`fetch_subtitles.py`、`.venv/`。如果原仓库已有 `.gitignore`，请合并规则而非直接覆盖。

## 本地运行

要求 Node.js 20.19+ 或 22.12+：

```sh
npm install
npm run dev
```

访问 http://localhost:5173 。

```sh
npm run build
npm run preview
```

构建脚本读取仓库根目录的 `content/<video-id>/metadata.json`、`en.vtt` 和 `zh.vtt`，生成 `public/catalog.json` 和 `public/content/`，然后由 Vite 打包至 `dist/`。生成文件不提交到 Git；内容源文件仍由原字幕自动化流程维护。

### 增加访谈标题

可以在现有 `metadata.json` 中补充 `title` 和 `description`，否则网站使用视频 ID 作为标题。自动化脚本重新处理视频时可能覆盖这些字段，需要后续调整脚本保留元数据。

## Cloudflare Pages

- GitHub 仓库：`Rijkstarhn/30Talk`
- Framework preset: Vite
- Build command: `npm run build`
- Output directory: `dist`
- Root directory: `/`
- Environment: Node.js 22（如果平台允许选择）

GitHub main 分支内容更新将触发重新部署（需在 Cloudflare 中完成 GitHub 集成）。

## 已知限制

- 当前仅支持 YouTube；Vimeo / MP4 / HLS 留到下一版。
- 仅使用官方 YouTube iframe API 播放；原生全屏 iframe 内不能叠加网页自定义字幕。
- 当前英文与中文字幕依照各自时间戳同步展示，字幕列表假定同顺序匹配；复杂不对齐字幕需要后续优化。
- 进度保存在当前浏览器 localStorage，不能跨设备同步；部分视频不允许嵌入。
- 首次访问时会从 YouTube 缩略图服务加载图片；用户需要能够访问 YouTube。
- 字幕文件发布到公开网站之前，应确认具备使用与再分发授权。
- 本项目包尚未在 Mac Firefox / iPad Safari 上完成实机测试。
