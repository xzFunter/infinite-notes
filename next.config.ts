/** @type {import('next').NextConfig} */
const nextConfig = {
  // 保留你原本的局域网/群晖本机 IP 允许源配置
  allowedDevOrigins: ['192.168.0.112'],

  // 【核心新增】：加入重写规则，强制拦截静态图片请求，暗中转交给 API 处理
  async rewrites() {
    return [
      {
        source: '/uploads/:path*',
        destination: '/api/uploads/:path*',
      },
    ];
  },
};

module.exports = nextConfig;