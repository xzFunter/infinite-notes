# 1. 将基础镜像升级到 Node 20，满足最新 Next.js 和 Tailwind 的要求
FROM node:20-alpine

WORKDIR /app

# 2. 【核心修复】：为 better-sqlite3 安装编译所需的系统依赖
# 这行代码会在极简的 Alpine 系统里装上 Python3 和 C++ 编译器
RUN apk add --no-cache python3 make g++

# 复制依赖配置并安装
COPY package.json package-lock.json* ./
RUN npm ci

# 复制所有源代码
COPY . .

# 构建 Next.js 项目
RUN npm run build

# 暴露 3000 端口
EXPOSE 3000

# 启动命令
CMD ["npm", "start"]