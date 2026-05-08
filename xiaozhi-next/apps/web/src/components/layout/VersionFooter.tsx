export function VersionFooter() {
  return (
    <footer className="border-t py-3 px-6 text-center text-xs text-muted-foreground">
      <span>小智 ESP32 Server v1.0.0</span>
      <span className="mx-2">|</span>
      <span>© {new Date().getFullYear()} XiaoZhi Team</span>
    </footer>
  );
}
