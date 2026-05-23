/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * 版本文件生成脚本
 * 
 * 在构建时生成 public/version.json 文件，用于前端版本检测。
 * 当检测到版本不一致时，提示用户刷新页面获取最新版本。
 */

const fs = require('fs');
const path = require('path');

// 生成版本信息
const versionInfo = {
  // 使用时间戳作为版本号，确保每次构建都是唯一的
  version: Date.now().toString(),
  // 构建时间（ISO 格式）
  buildTime: new Date().toISOString(),
  // 从 package.json 读取应用版本
  appVersion: require('../package.json').version || '0.1.0'
};

// 输出路径
const outputPath = path.join(__dirname, '../public/version.json');

// 写入文件
fs.writeFileSync(outputPath, JSON.stringify(versionInfo, null, 2));

console.log('✓ Version file generated:', outputPath);
console.log('  Version:', versionInfo.version);
console.log('  Build Time:', versionInfo.buildTime);
console.log('  App Version:', versionInfo.appVersion);
