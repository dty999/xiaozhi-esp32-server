import type { ToolResult } from '../func-handler';

export async function handlePlayMusic(
  args: Record<string, any>,
  _context: Record<string, any>,
): Promise<ToolResult> {
  const songName = args.song || args.music || args.name || '';
  const artist = args.artist || args.singer || '';

  if (!songName) {
    return {
      success: false,
      result: '请告诉我您想听什么歌曲？',
    };
  }

  const query = artist ? `${artist}的${songName}` : songName;
  const searchUrl = `https://music.163.com/#/search/m/?s=${encodeURIComponent(query)}&type=1`;

  return {
    success: true,
    result: `正在为您播放${query}，请稍等。`,
    needsLLMResponse: false,
  };
}
