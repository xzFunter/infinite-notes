import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

export async function GET(
  request: Request,
  props: { params: Promise<{ filename: string }> | { filename: string } }
) {
  // 兼容 Next.js 不同的 params 异步/同步获取方式
  const params = await props.params;
  const filename = params.filename;
  
  // 安全检查：防止路径穿越攻击（例如通过 .. 访问系统敏感文件）
  if (!filename || filename.includes('/') || filename.includes('..')) {
    return new NextResponse('Bad Request', { status: 400 });
  }

  // 直通群晖 NAS 挂载的物理 uploads 文件夹
 const filePath = join(process.cwd(), 'data/uploads', filename);

  // 如果物理文件压根不存在，直接抛出 404
  if (!existsSync(filePath)) {
    return new NextResponse('Image Not Found on Storage', { status: 404 });
  }

  try {
    // 越过 Next.js 静态文件锁，直接从硬盘读取图片的二进制流
    const buffer = await readFile(filePath);
    
    // 识别常见格式并动态赋予网页正确的媒体类型 header
    const ext = filename.split('.').pop()?.toLowerCase();
    let mimeType = 'image/png';
    if (ext === 'jpg' || ext === 'jpeg') mimeType = 'image/jpeg';
    else if (ext === 'gif') mimeType = 'image/gif';
    else if (ext === 'webp') mimeType = 'image/webp';
    else if (ext === 'svg') mimeType = 'image/svg+xml';

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': mimeType,
        'Cache-Control': 'public, max-age=31536000, immutable', // 允许浏览器强缓存，极大提升页面二次加载速度
      },
    });
  } catch (error) {
    console.error('动态读取图片失败:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}