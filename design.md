# design.md

## 一、产品视觉定位

### 产品信息

```text
产品名称：【待填写】
产品类型：【SaaS / 中后台 / App / 官网 / 其他】
主要用户：【待填写】
默认主题：【浅色 / 深色 / 跟随系统】
```

### 品牌关键词

```text
【例如】
专业
现代
科技
可信
克制
高级
```

### 核心视觉方向

```text
【选择一个或组合】
Linear 风格
Stripe Dashboard 风格
极简企业 SaaS 风格
自定义品牌风格
```

### 设计优先级

```text
清晰
>
易用
>
一致
>
品牌表达
>
装饰性
```

---

## 二、视觉参考原则

### Linear

适合参考：

- 页面层级
- 高级留白
- 精致边框
- 克制渐变
- 产品感
- 深浅色主题

### Stripe Dashboard

适合参考：

- Dashboard 信息结构
- 表格
- 数据卡片
- 企业级导航
- 操作层级
- 信息密度

### 极简企业 SaaS

适合参考：

- 商务感
- 清爽
- 稳定
- 通用
- 易维护
- 长期扩展

不要复制具体品牌元素和完整布局。

---

## 三、颜色系统

### Background

```text
页面主背景：【待填写】
次级背景：【待填写】
Surface：【待填写】
Elevated Surface：【待填写】
```

### Text

```text
Primary Text：【待填写】
Secondary Text：【待填写】
Muted Text：【待填写】
Disabled Text：【待填写】
```

### Brand

```text
Primary：【待填写】
Primary Hover：【待填写】
Primary Active：【待填写】
Primary Soft：【待填写】
```

### Border

```text
Default Border：【待填写】
Subtle Border：【待填写】
Strong Border：【待填写】
```

### Semantic

```text
Success：【待填写】
Warning：【待填写】
Error：【待填写】
Info：【待填写】
```

### 使用规则

- 大多数 Surface 使用中性色。
- 品牌色用于引导注意力。
- Success / Warning / Error / Info 只表示状态。
- 不使用过多强调色。
- 不滥用大面积渐变。
- 不允许低对比度正文。

---

## 四、字体系统

### Font Family

```text
中文字体：【待填写】
英文字体：【待填写】
数字字体：【待填写，可与英文字体相同】
```

推荐：

```text
Inter
Noto Sans SC
PingFang SC
Microsoft YaHei
系统字体栈
```

### Typography Scale

```text
Display：48-64px
H1：32-40px
H2：24-32px
H3：18-24px

Body Large：16-18px
Body：14-16px
Small：12-14px
Caption：12px
```

### Font Weight

```text
Regular：400
Medium：500
Semibold：600
Bold：700
```

### 行高建议

```text
大标题：1.1-1.25
普通标题：1.2-1.35
正文：1.5-1.7
紧凑 UI：1.3-1.5
```

---

## 五、间距系统

默认使用：

```text
4
8
12
16
24
32
40
48
64
80
96
```

推荐：

```text
图标与文字：8px

按钮内部水平间距：
12-20px

表单字段：
16-24px

Card Padding：
20-32px

Section Gap：
48-96px
```

禁止出现大量没有规律的：

```text
13px
19px
27px
37px
```

除非是视觉校准所必须。

---

## 六、页面容器

### Desktop

```text
主要内容最大宽度：【1200-1440px，待项目确认】
左右 Padding：【24-48px】
```

### 阅读型内容

```text
最大宽度：640-800px
```

### Mobile

```text
左右 Padding：16-20px
```

### 原则

- Dashboard 可以更宽。
- 阅读型正文不要铺满超宽屏幕。
- 同一层级页面容器宽度保持一致。

---

## 七、圆角系统

推荐：

```text
XS：4px
SM：6px
MD：8px
LG：12px
XL：16px
2XL：20px
```

项目默认：

```text
Button：【建议 8px】
Input：【建议 8px】
Card：【建议 12px】
Dropdown：【建议 10-12px】
Modal：【建议 16px】
Drawer：【建议 16px 或按组件库】
```

原则：

- 保持稳定。
- 不同组件不能随意使用不同圆角。
- 不默认使用超大圆角。

---

## 八、边框系统

推荐：

```text
Default：
1px solid var(--border)

Subtle：
1px solid var(--border-subtle)

Strong：
1px solid var(--border-strong)
```

优先使用边框而非重阴影建立结构。

---

## 九、阴影系统

阴影保持克制。

```text
Shadow XS：
按钮 / 小型浮层

Shadow SM：
Dropdown
Floating Toolbar

Shadow MD：
Popover
Modal
Drawer
```

Card 默认：

```text
无阴影
或
非常轻的 Shadow XS
```

---

## 十、按钮系统

### 类型

```text
Primary
Secondary
Ghost
Destructive
Link
```

### 高度

```text
Small：32px
Default：40px
Large：44-48px
```

### 状态

```text
Default
Hover
Active
Focus
Disabled
Loading
```

### 规则

- 每个视觉区域最多一个强 Primary。
- Secondary 不应抢夺 Primary 注意力。
- Destructive 必须明确区别。
- Loading 不允许造成布局明显跳动。

---

## 十一、输入框系统

### 默认

```text
高度：40-44px
圆角：【待填写】
Border：【待填写】
Background：【待填写】
```

### 状态

```text
Default
Hover
Focus
Disabled
Error
Success
```

### 规则

- 必须有 Label。
- Focus 清晰。
- Error 信息明确。
- Placeholder 只用于辅助示例。
- 不用 Placeholder 替代 Label。

---

## 十二、Select / DatePicker / Cascader

要求：

- 高度与 Input 一致。
- Focus 状态一致。
- Dropdown Radius 一致。
- Dropdown Shadow 一致。
- Loading / Empty 状态统一。
- 多选 Tag 风格统一。

---

## 十三、卡片系统

推荐：

```text
Background：Surface
Border：Subtle
Radius：12px
Padding：24px
Shadow：None / XS
```

原则：

- Card 用于分组。
- 不把所有 Section 都做成 Card。
- 避免 Card 套 Card。
- Card Header / Body / Footer 间距保持一致。

---

## 十四、图标系统

### 图标库

```text
【待填写，例如】
Lucide
Ant Design Icons
Material Symbols
自有 IconFont
```

### 尺寸

```text
Small：14-16px
Default：16-20px
Large：20-24px
```

### 原则

- 一个项目尽量只用一套主要图标风格。
- Outline 与 Filled 不随意混用。
- 图标视觉尺寸保持一致。

---

## 十五、Tag / Badge

适用于：

- Status
- Filter
- Category
- Metadata

推荐：

```text
高度：24-28px
Radius：6px 或 Pill
Font：12-13px
```

Tag 是少数适合使用 Pill Radius 的组件。

---

## 十六、Table

Table 优先保证：

- 扫描效率
- 列对齐
- 操作清晰
- 信息密度

### 建议

```text
Row Height：44-56px
Header：Medium / Semibold
Body：Regular
```

### 操作列

- 操作数量较少时直接展示。
- 操作较多时使用 More Menu。
- Destructive 操作不要与普通操作同权重。

### Mobile

根据场景选择：

- 横向滚动
- Card 化
- 折叠次要列
- Detail Drawer

不要强行把所有列压缩到 375px。

---

## 十七、Modal / Drawer

### Modal

适合：

- 确认
- 短表单
- 短流程

### Drawer

适合：

- 详情
- 较长表单
- 复杂辅助流程

### 规则

- Header / Body / Footer 清晰。
- Footer 操作优先级明确。
- 不允许内容超出可视区域后无法滚动。
- Mobile 需要单独检查。

---

## 十八、Tooltip / Popover

Tooltip：

- 只放简短说明。
- 不放复杂表单。

Popover：

- 可放短列表、筛选、更多操作。

两者视觉风格统一。

---

## 十九、导航系统

### Sidebar

推荐：

```text
Logo
↓
Primary Navigation
↓
Secondary Navigation
↓
Account / Settings
```

### Active

必须具有明确的：

- Background
- Text
- Icon

状态变化。

### 避免

- 过多分割线
- 多层级全部展开
- 过宽 Sidebar
- 选中状态不明显

---

## 二十、Dashboard 页面

推荐结构：

```text
Sidebar
↓
Top Navigation
↓
Page Header
↓
Metrics
↓
Main Content
↓
Table / Chart / Activity
```

### Metrics Card

优先级：

```text
数字
>
趋势
>
标签
>
辅助说明
```

不要：

- 指标卡加入大量装饰插图
- 每个指标卡使用不同颜色
- 过度使用渐变

---

## 二十一、登录页

### Desktop

推荐：

#### 方案 A：极简居中

```text
Logo

欢迎回来
说明

账号
密码

登录

其他登录方式

注册 / 帮助
```

#### 方案 B：双栏

```text
品牌区
|
登录区
```

左侧：

- 品牌表达
- 产品截图
- 简短卖点

右侧：

- 登录表单

### Mobile

取消或大幅简化品牌区。

---

## 二十二、Landing Page

推荐结构：

```text
Navbar
↓
Hero
↓
Social Proof
↓
Core Value
↓
Features
↓
Product Screenshot
↓
Use Cases
↓
CTA
↓
Footer
```

### Hero

应该快速回答：

1. 这是什么？
2. 能解决什么问题？
3. 用户下一步做什么？

---

## 二十三、响应式系统

### Mobile

```text
< 768px
```

要求：

- 单栏优先
- Padding 16-20px
- 减少装饰
- 简化导航
- 优先核心任务

### Tablet

```text
768-1024px
```

重点检查：

- Grid 列数
- Sidebar
- Table
- Modal

### Desktop

```text
> 1024px
```

重点检查：

- 内容最大宽度
- 大屏空白
- 信息密度

### 必须检查

```text
375
768
1024
1440
1920
```

---

## 二十四、动效系统

推荐：

```text
Fast：120-150ms
Default：180-220ms
Slow：250-300ms
```

常用：

```text
ease-out
ease-in-out
```

动效用于：

- 状态反馈
- 内容出现
- Menu
- Modal
- Dropdown
- Hover

不要为了装饰添加复杂动画。

---

## 二十五、状态页面

必须统一以下状态：

### Loading

```text
Skeleton
Spinner
Progress
```

根据场景选择。

### Empty

包括：

- 图标 / 插图
- 标题
- 说明
- CTA

### Error

包括：

- 错误说明
- 重试
- 返回
- 联系支持

### Disabled

必须视觉可见，同时保证可读性。

---

## 二十六、项目专属组件

```text
UI 框架：【待填写】

Button：【待填写】
Input：【待填写】
Select：【待填写】
Table：【待填写】
Modal：【待填写】
Drawer：【待填写】
Tabs：【待填写】
Form：【待填写】
Toast / Message：【待填写】
Empty：【待填写】
Loading：【待填写】
Error：【待填写】
```

如果已有成熟组件规范，以现有设计系统为准。

---

## 二十七、Dark Mode

如果项目支持深色主题：

必须单独定义：

```text
Background
Surface
Elevated Surface
Border
Text Primary
Text Secondary
Brand
Semantic
```

禁止通过简单颜色反转实现 Dark Mode。

Dark Mode 需要重新检查：

- Contrast
- Border
- Shadow
- Chart
- Image
- Code Block
- Disabled

---

## 二十八、Visual QA Checklist

### Layout

- [ ] 页面容器宽度统一
- [ ] 栅格一致
- [ ] 对齐稳定
- [ ] 没有无意义大面积空白
- [ ] 没有局部拥挤

### Spacing

- [ ] 使用统一间距体系
- [ ] Related Content 正确分组
- [ ] Card Padding 一致
- [ ] Section Gap 一致

### Typography

- [ ] H1 / H2 / H3 层级清晰
- [ ] 正文易读
- [ ] 次级信息合理弱化
- [ ] 没有过多字号

### Components

- [ ] Button 高度统一
- [ ] Input 高度统一
- [ ] Card Radius 统一
- [ ] Icon 风格统一
- [ ] Dropdown 风格统一
- [ ] Modal / Drawer 风格统一

### Interaction

- [ ] Hover
- [ ] Focus
- [ ] Active
- [ ] Disabled
- [ ] Loading
- [ ] Error
- [ ] Empty

### Responsive

- [ ] 375px
- [ ] 768px
- [ ] 1024px
- [ ] 1440px
- [ ] 1920px

### Final

- [ ] Primary CTA 清晰
- [ ] 视觉层级明确
- [ ] 无过度装饰
- [ ] 无明显 AI 模板化
- [ ] 页面具有统一产品感
- [ ] 可以进入生产环境

---

## 二十九、Codex 每次 UI 任务执行指令

每次视觉设计任务可以附加：

```text
请先完整阅读项目根目录的 AGENTS.md 和 design.md。

本次 UI 任务要求：

1. 保留现有业务逻辑、API、权限与路由。
2. 先分析当前页面结构和最明显的视觉问题。
3. 严格按照 design.md 中的颜色、字体、间距、圆角、组件规范实现。
4. 优先复用现有组件与 Design Token。
5. 不要引入无必要的新 UI 依赖。
6. 不要使用明显的 AI 模板化视觉套路。
7. 完成后启动项目并检查真实页面。
8. 执行 Visual QA：
   - 视觉层级
   - 间距
   - 对齐
   - Typography
   - Button
   - Form
   - Card
   - Navigation
   - Responsive
9. 检查 375 / 768 / 1024 / 1440 / 1920px。
10. 如果发现明显视觉问题，直接继续修改，而不是只输出建议。
11. 最终页面应达到生产级视觉完成度。
```

---

## 三十、风格选择

### Linear 风格

适合：

- App 登录页
- AI 产品
- 开发者工具
- 高端科技产品
- 产品官网

关键词：

```text
极简
克制
高级
产品感
精致
深色
微妙渐变
```

### Stripe Dashboard 风格

适合：

- 管理后台
- 支付
- 订单
- 财务
- 数据
- 企业 SaaS

关键词：

```text
专业
规整
可信赖
数据感
企业级
高扫描效率
```

### 极简企业 SaaS

适合：

- 通用企业后台
- 企业官网
- 登录页
- B 端系统

关键词：

```text
清爽
稳定
商务
通用
长期可维护
```

---

## 三十一、维护原则

出现新的重复视觉反馈时：

不要每次都只写在 Prompt 里。

应该判断是否需要更新本文件。

例如反复出现：

> 卡片圆角太大

则应该更新：

```text
Card Radius：12px
禁止超过 16px
```

如果反复出现：

> 页面太松

则应该明确：

```text
Dashboard 默认采用紧凑密度。
Section Gap 不超过 48px。
Card Padding 默认 20-24px。
```

让设计反馈最终沉淀为项目规则。
