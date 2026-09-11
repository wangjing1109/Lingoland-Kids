# Lingoland Kids · 儿童英语闯关（离线版）

儿童英语单词闯关应用：听力、口语、拼写、复习、愿望罐、徽章激励，全部本地运行。

## 特性
- **纯离线、零外链**：所有词库、题库、字体、逻辑均打包在内，不依赖任何外部服务器。
- **发音用系统 TTS**：调用浏览器/系统自带的语音合成（speechSynthesis），无需联网 TTS 接口。
- **单文件入口**：`index.html` + `assets/`，任意静态托管直接可用。

## 目录结构
```
index.html          入口页面
assets/
  app.js            主逻辑
  app.css           样式
  fonts.css         字体
  fonts/            本地字体 woff2
  voice.js          发音（仅 speechSynthesis）
  qbank.js          题库
  words.js          词库
  celebrate.js      庆祝特效
  emoji-map.js      表情映射
```

## 部署
适合任意静态托管（Gitee Pages / 腾讯云 CloudBase / 任意支持静态文件的服务器）。
把 `index.html` 与 `assets/` 放在网站根目录即可。
