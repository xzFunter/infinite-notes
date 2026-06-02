import Whiteboard from '../../../components/Whiteboard';
// 1. 注意这里加了 async，并且 params 的类型变成了 Promise
export default async function BoardPage({ params }: { params: Promise<{ id: string }> }) {
  // 2. 使用 await 等待参数解析
  const resolvedParams = await params;

  return (
    <main>
      <Whiteboard boardId={resolvedParams.id} />
    </main>
  );
}