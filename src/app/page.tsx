// 首页：重定向到对话工作台
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function HomePage() {
  redirect('/chat');
}
