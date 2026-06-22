import { NextResponse } from 'next/server';
import { writeFile, rename, mkdir, readdir, unlink } from 'fs/promises';
import { existsSync, statSync } from 'fs';
import path from 'path';

// 统一指向刚刚规划好的 data 目录
const UPLOADS_DIR = path.join(process.cwd(), 'data', 'uploads');
const TRASH_DIR = path.join(process.cwd(), 'data', 'trash');

// 垃圾箱文件保留天数
const TRASH_TTL_DAYS = 30;

// 清理过期垃圾文件
async function cleanExpiredTrash(): Promise<number> {
  let deleted = 0;
  try {
    if (!existsSync(TRASH_DIR)) return 0;
    const files = await readdir(TRASH_DIR);
    const now = Date.now();
    const ttlMs = TRASH_TTL_DAYS * 24 * 60 * 60 * 1000;

    for (const file of files) {
      const filePath = path.join(TRASH_DIR, file);
      try {
        const stats = statSync(filePath);
        if (now - stats.mtimeMs > ttlMs) {
          await unlink(filePath);
          deleted++;
        }
      } catch { /* 单个文件失败不影响其他 */ }
    }
  } catch { /* ignore */ }
  return deleted;
}

// 【POST】上传图片
export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });

    if (!existsSync(UPLOADS_DIR)) await mkdir(UPLOADS_DIR, { recursive: true });

    const buffer = Buffer.from(await file.arrayBuffer());
    // 加上时间戳防止同名文件覆盖
    const filename = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, '')}`;
    const targetPath = path.join(UPLOADS_DIR, filename);

    await writeFile(targetPath, buffer);
    
    // 给前端返回的依然是虚拟的 /uploads/ 路径，靠 Next.config 重写拦截
    return NextResponse.json({ url: `/uploads/${filename}` });
  } catch (error) {
    console.error('上传失败:', error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}

// 【DELETE】移入回收站
export async function DELETE(request: Request) {
  try {
    const { url } = await request.json();
    if (!url || !url.startsWith('/uploads/')) return NextResponse.json({ success: false }, { status: 400 });

    const filename = url.replace('/uploads/', '');
    const sourcePath = path.join(UPLOADS_DIR, filename);
    const targetPath = path.join(TRASH_DIR, filename);

    if (!existsSync(sourcePath)) return NextResponse.json({ success: true, message: '已不存在' });
    if (!existsSync(TRASH_DIR)) await mkdir(TRASH_DIR, { recursive: true });

    // 完美使用 rename 瞬间移动！再也不会报 EXDEV 错误
    await rename(sourcePath, targetPath);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('移入回收站失败:', error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

// 【PUT】撤销删除 (Ctrl+Z 时从回收站捞回)
export async function PUT(request: Request) {
  try {
    const { url } = await request.json();
    if (!url || !url.startsWith('/uploads/')) return NextResponse.json({ success: false }, { status: 400 });

    const filename = url.replace('/uploads/', '');
    const sourcePath = path.join(TRASH_DIR, filename);
    const targetPath = path.join(UPLOADS_DIR, filename);

    if (!existsSync(sourcePath)) return NextResponse.json({ success: true });
    if (!existsSync(UPLOADS_DIR)) await mkdir(UPLOADS_DIR, { recursive: true });

    await rename(sourcePath, targetPath);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('恢复文件失败:', error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

// 【GET】清理过期垃圾文件（>30天）
export async function GET() {
  try {
    const deleted = await cleanExpiredTrash();
    return NextResponse.json({ success: true, deleted });
  } catch (error) {
    console.error('清理垃圾箱失败:', error);
    return NextResponse.json({ success: false, error: 'Cleanup failed' }, { status: 500 });
  }
}