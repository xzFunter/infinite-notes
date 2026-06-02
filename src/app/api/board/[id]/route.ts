import { NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// 1. 将数据库目录指向专门用来挂载的 data 文件夹
const dbDir = path.join(process.cwd(), 'data');

// 确保 data 文件夹在容器内一定存在
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// 将数据库文件牢牢锁定在 data 目录下
const dbPath = path.join(dbDir, 'dev.db');

// 2. 连接数据库
const db = new Database(dbPath);

// 3. 初始化表结构 (程序启动时自动执行)
db.exec(`
  CREATE TABLE IF NOT EXISTS Board (
    id TEXT PRIMARY KEY,
    elements TEXT,
    parentBoardId TEXT,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// GET 请求：获取白板数据
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const stmt = db.prepare('SELECT * FROM Board WHERE id = ?');
  const board = stmt.get(id) as any;
  
  return NextResponse.json(board || { elements: "[]", parentBoardId: null });
}

// POST 请求：保存白板数据
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { elements, parentBoardId } = await request.json();
  
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO Board (id, elements, parentBoardId, updatedAt)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
  `);
  stmt.run(id, JSON.stringify(elements), parentBoardId);
  
  return NextResponse.json({ success: true });
}