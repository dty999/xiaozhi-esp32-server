/**
 * 认证路由组布局 — 居中卡片式，无侧栏导航
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm px-5">
        {children}
      </div>
    </div>
  );
}
