/**
 * 认证路由组布局 — 居中卡片式，无侧栏导航
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30">
      <div className="w-full max-w-md px-4 py-12">{children}</div>
    </div>
  );
}
