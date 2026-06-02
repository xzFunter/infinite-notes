import { redirect } from 'next/navigation';

export default function Home() {
  // 默认重定向到一个主白板 ID
  redirect('/board/main_board_001');
}