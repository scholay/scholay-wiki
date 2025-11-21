# 搜索提示文本省略优化

## 问题

当搜索关键词很长时，提示文本可能会换行或溢出容器，影响美观。

**原始效果：**
```
已为你找到 "这是一个非常非常非常长的搜索关键词 This is a very very very long search query" 的结果
仅按 "这是一个非常非常非常长的搜索关键词" 查找
```

如果文本过长，会出现：
- 换行（不美观）
- 溢出容器
- 影响布局

## 解决方案

### 设计原则

**单行显示 + 智能省略**

省略规则：
1. **原始查询词** 可省略（max-width: 200px）
2. **翻译查询词** 可省略（max-width: 200px）
3. **按钮内查询词** 可省略（max-width: 200px）
4. **按钮本身** 不收缩（flex-shrink: 0）

### 省略效果示例

#### 短关键词（正常显示）
```
已为你找到 "大数据 Big Data" 的结果
仅按 "大数据" 查找
```

#### 中等长度（部分省略）
```
已为你找到 "深度学习在医学影像诊断中的应用 Deep learn..." 的结果
仅按 "深度学习在医学影..." 查找
```

#### 超长关键词（多处省略）
```
已为你找到 "这是一个非常长的研究... This is a very long..." 的结果
仅按 "这是一个非常长的..." 查找
```

## CSS实现

### 1. 容器设置

```css
.search-translation-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  overflow: hidden; /* 防止溢出 */
}
```

### 2. 提示文本（flex弹性）

```css
.search-translation-hint .hint-text {
  flex: 1; /* 占据剩余空间 */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0; /* 重要：允许收缩 */
}
```

### 3. 查询词省略

```css
/* 原始查询词 */
.hint-query-original {
  display: inline-block;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom; /* 对齐 */
}

/* 翻译查询词 */
.hint-query-translated {
  display: inline-block;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
}
```

### 4. 按钮（固定不收缩）

```css
.hint-action-btn {
  flex-shrink: 0; /* 不收缩 */
  white-space: nowrap;
  max-width: 300px;
  overflow: hidden;
}

/* 按钮内查询词 */
.hint-btn-query {
  display: inline-block;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
}
```

## HTML结构

```jsx
<div className="search-translation-hint">
  <span className="hint-text">
    已为你找到 "
    <span className="hint-query-original" title={originalQuery}>
      {originalQuery}
    </span>
    {' '}
    <span className="hint-query-translated" title={translatedQuery}>
      {translatedQuery}
    </span>
    " 的结果
  </span>
  
  <button
    className="hint-action-btn"
    title={`仅按 "${originalQuery}" 查找`}
  >
    仅按 "
    <span className="hint-btn-query" title={originalQuery}>
      {originalQuery}
    </span>
    " 查找
  </button>
</div>
```

## 关键技术点

### 1. `title` 属性显示完整文本

```jsx
<span className="hint-query-original" title={queryInfo.originalQuery}>
  {queryInfo.originalQuery}
</span>
```

**效果：** 鼠标悬停时显示完整查询词

### 2. `min-width: 0` 允许flex收缩

```css
.hint-text {
  flex: 1;
  min-width: 0; /* 重要！ */
}
```

**原因：** flex子元素默认 `min-width: auto`，可能阻止收缩

### 3. `inline-block` 实现内联省略

```css
.hint-query-original {
  display: inline-block; /* 而不是 inline */
  max-width: 200px;
  text-overflow: ellipsis;
}
```

**原因：** `text-overflow` 只对块级元素生效

### 4. `vertical-align: bottom` 对齐

```css
.hint-query-original {
  vertical-align: bottom;
}
```

**效果：** 防止省略号导致行高不一致

## 响应式适配

### 桌面端（大屏）

```css
.hint-query-original,
.hint-query-translated {
  max-width: 200px; /* 较宽 */
}
```

### 移动端（小屏）

可以进一步减小：

```css
@media (max-width: 768px) {
  .hint-query-original,
  .hint-query-translated {
    max-width: 100px; /* 更窄 */
  }
  
  .hint-action-btn {
    max-width: 200px;
  }
}
```

## 效果对比

### 优化前

```
已为你找到 "一个非常非常长的学术研究关键词描述 A very very long academic
research keyword description" 的结果     仅按 "一个非常非常长的学术研究关键
词描述" 查找
```

**问题：**
- ❌ 多行显示
- ❌ 布局混乱
- ❌ 影响美观

### 优化后

```
已为你找到 "一个非常非常... A very very long..." 的结果  仅按 "一个非常非常..." 查找
```

**优点：**
- ✅ 单行显示
- ✅ 布局整齐
- ✅ 悬停显示完整内容
- ✅ 自适应容器宽度

## 测试场景

### 场景1：短查询

```
输入: "AI"
显示: 已为你找到 "AI Artificial Intelligence" 的结果  仅按 "AI" 查找
效果: 完全显示，无省略
```

### 场景2：中等长度

```
输入: "深度学习在医学影像诊断中的应用"
显示: 已为你找到 "深度学习在医学影像诊断... Deep learning in medical..." 的结果
      仅按 "深度学习在医学影..." 查找
效果: 部分省略，鼠标悬停显示完整
```

### 场景3：超长查询

```
输入: "基于深度神经网络的多模态医学影像分析与诊断系统的研究与实现"
显示: 已为你找到 "基于深度神经网络的... Research and implement..." 的结果
      仅按 "基于深度神经网..." 查找
效果: 多处省略，保持单行
```

## 浏览器兼容性

| CSS属性 | Chrome | Firefox | Safari | Edge |
|---------|--------|---------|--------|------|
| `text-overflow: ellipsis` | ✅ | ✅ | ✅ | ✅ |
| `flex` | ✅ | ✅ | ✅ | ✅ |
| `min-width: 0` | ✅ | ✅ | ✅ | ✅ |

**结论：** 所有现代浏览器均支持

## 总结

### ✅ 解决的问题

1. 长关键词导致换行
2. 布局溢出
3. 影响美观

### 🎨 优化效果

1. **单行显示** - 始终保持一行
2. **智能省略** - 多处省略点
3. **完整提示** - title属性显示全文
4. **自适应** - 根据容器宽度调整

### 📁 修改的文件

- `frontend-user/src/pages/SearchResultsPage.js`
  - 添加 `title` 属性
  - 使用 `span` 包裹查询词
  
- `frontend-user/src/pages/SearchResultsPage.css`
  - 省略样式实现
  - flex布局优化

