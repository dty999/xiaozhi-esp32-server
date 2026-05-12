export function VersionFooter() {
  return (
    <footer className="h-10 border-t bg-card flex items-center justify-center gap-2 text-[11px] text-muted-foreground shrink-0">
      <span>小智 ESP32 Server v1.0.0</span>
      <span className="text-border">·</span>
      <span>© {new Date().getFullYear()} XiaoZhi Team</span>
    </footer>
  );
}
