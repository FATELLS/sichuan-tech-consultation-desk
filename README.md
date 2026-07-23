# 川科讯｜科技信息咨询响应平台

面向四川省科学技术信息研究所新入职同事的电话咨询辅助平台，支持按来电主体快速查询回复口径、集中检索业务知识库，并通过 GLM-5.2 驱动“小科助手”生成正式、自然、可直接用于电话沟通的回复。

本项目采用浏览器/服务器（B/S）方式运行，不需要 GPT 或 ChatGPT 登录。部署完成后，使用普通浏览器打开本机或内网服务器地址即可使用。

## 功能

- 按银行、科技型企业、兄弟单位、下级单位、上级部门分类响应
- 查询建议话术、核验要点、办理路径和风险边界
- 集中检索科技创新券、科技报告、项目验收、科技金融等知识
- 使用 GLM-5.2 的“小科助手”生成电话回复
- 提供不包含密钥的服务健康检查

## 方式一：Docker 本地部署（推荐）

### 1. 准备配置

项目目录中已提供 `.dev.vars.example`。首次部署时执行：

```bash
cp .dev.vars.example .dev.vars
```

然后编辑 `.dev.vars`：

```text
GLM_API_KEY=您的智谱API密钥
GLM_API_BASE=https://open.bigmodel.cn/api/coding/paas/v4
```

`.dev.vars` 已被 Git 和 Docker 构建上下文忽略，真实密钥不会进入源代码或镜像。

### 2. 启动

```bash
docker compose up -d --build
```

启动完成后访问：

- 本机：`http://localhost:3000`
- 内网其他电脑：`http://服务器内网IP:3000`

如需修改对外端口，例如使用 `8080`：

```bash
LOCAL_PORT=8080 docker compose up -d --build
```

### 3. 查看状态

```bash
docker compose ps
docker compose logs -f consultation-desk
```

健康检查地址：

```text
http://localhost:3000/xk-assistant/health
```

正常时会返回 `ok: true`、`model: glm-5.2` 和 `configured: true`，不会返回 API 密钥。

### 4. 停止或更新

```bash
docker compose down
```

代码更新后重新执行：

```bash
docker compose up -d --build
```

## 方式二：Node.js 本地部署

要求 Node.js 22.13 或更高版本。

### 1. 安装依赖和配置密钥

```bash
npm ci
cp .dev.vars.example .dev.vars
```

编辑 `.dev.vars`，填写真实的 `GLM_API_KEY`。

### 2. 生产方式启动

```bash
npm run local:start
```

默认监听 `0.0.0.0:3000`。需要修改端口时：

```bash
PORT=8080 npm run local:start
```

### 3. 开发方式启动

```bash
npm run dev
```

## 单位内网部署建议

- 将本项目放在一台安装了 Docker 的单位内网服务器上。
- 只在单位内网开放所需端口，不要直接暴露管理端口。
- 通过防火墙限制允许访问的网段。
- 如需使用正式域名和 HTTPS，可在容器前增加 Nginx、Caddy 或单位现有反向代理。
- 定期轮换 GLM API 密钥；不要通过聊天、邮件或截图传播 `.dev.vars`。
- 小科助手调用智谱云端模型，因此服务器仍需能够访问 `open.bigmodel.cn`。知识库查询功能在断网时仍可使用。

## 验证

```bash
npm test
```

测试会检查页面渲染、助手接口、健康检查以及密钥不进入源代码。

## 常见问题

### 页面能打开，但小科助手无法回复

依次检查：

1. `http://服务器地址:端口/xk-assistant/health` 中 `configured` 是否为 `true`。
2. `.dev.vars` 中的 `GLM_API_KEY` 是否有效。
3. 服务器是否能够访问 `https://open.bigmodel.cn`。
4. Docker 日志中是否出现上游接口超时或余额不足。

### 内网其他电脑打不开

确认服务器防火墙已放行部署端口，并使用服务器的内网 IP，而不是 `localhost`。

### 是否需要 ChatGPT 登录

不需要。本地部署版本不包含 ChatGPT 登录流程，用户直接使用浏览器访问即可。
